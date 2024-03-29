//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { uuid } = require('../utils/uuid');
const { streamToList } = require('../utils/stream');

const serializeChanges = change => (typeof change === 'string' ? change : JSON.stringify(change));

// TODO(burdon): Rename 'changes' to 'messages' (there are no implied semantics).
// TODO(burdon): Rename LogView.
module.exports = function LogsView(viewId, db, core, { append, isLocal }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, `${viewId}-logs`, { valueEncoding: 'json' });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith(`item.${viewId}.`)) {
        return [];
      }

      const { itemId } = value.data;

      const type = value.type.replace(`item.${viewId}.`, '');
      if (type === 'change') {
        return [[uuid('change', itemId, value.timestamp), value]];
      }

      return [];
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith(`item.${viewId}`))
        .sort((a, b) => a.value.timestamp - b.value.timestamp)
        .forEach(async ({ value }) => {
          const event = value.type.replace(`item.${viewId}.`, '');
          events.emit(event, value);

          if (event === 'change') {
            const { itemId } = value.data;

            const changes = await core.api[viewId].getChanges(itemId);
            const content = changes.map(({ data: { changes } }) => changes).map(serializeChanges).join('');

            events.emit(`${viewId}.logentry`, itemId, content, isLocal(value), changes);
          }
        });
    },

    api: {
      async create(core, { type, title = 'Untitled' }) {
        return core.api['items'].create({ type, title });
      },

      async getById(core, itemId) {
        const changes = (await core.api[viewId].getChanges(itemId)).map(({ data: { changes } }) => changes);
        const content = changes.map(serializeChanges).join('');
        const { data: { title, type } } = await core.api['items'].getInfo(itemId);

        return {
          itemId,
          type,
          title,
          content,
          changes
        };
      },

      // TODO(elmasse) Quick fix, this needs review. It might be better to use getChanges and return the proper value from there.
      async getLogs(core, itemId) {
        const changes = (await core.api[viewId].getChanges(itemId));
        return changes.map(({ data: { changes } }) => changes);
      },

      async getChanges(core, itemId, opts = {}) {
        const query = { reverse: opts.reverse };
        const fromKey = uuid('change', itemId, opts.lastChange);
        const toKey = `${uuid('change', itemId)}~`;

        if (opts.lastChange) {
          // greater than
          query.gt = fromKey;
        } else {
          // greater or equal
          query.gte = fromKey;
        }

        query.lte = toKey;

        const reader = viewDB.createValueStream(query);

        return streamToList(reader);
      },

      // TODO(burdon): core not required.
      // TODO(burdon): Rename changes.
      async appendChange(core, itemId, changes) {

        // TODO(burdon): Review protocol (e.g., "change").
        return append({
          type: `item.${viewId}.change`,
          data: { itemId, changes }
        });
      },

      onChange(core, itemId, cb) {
        const handler = async ({ data: { itemId: id, changes: lastChanges } }) => {
          if (id !== itemId) return;

          const changes = (await core.api[viewId].getChanges(itemId)).map(({ data: { changes } }) => changes);
          const content = changes.map(serializeChanges).join('');

          cb({
            itemId,
            content,
            changes,
            lastChanges
          });
        };

        events.on('change', handler);

        return () => {
          events.removeListener('change', handler);
        };
      },

      events
    }
  });
};

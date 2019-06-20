//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { append } = require('../protocol/messages');
const { uuid } = require('../utils/uuid');
const { streamToList } = require('../utils/stream');

const serializeChanges = change => (typeof change === 'string' ? change : JSON.stringify(change));

// TODO(burdon): Rename LogView.
module.exports = function LogsView({ core, db, partyManager }, { viewId }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, `${viewId}-logs`, { valueEncoding: 'json' });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith(`item.${viewId}.`)) {
        return [];
      }

      const partyKey = partyManager.getPartyKeyFromFeedKey(msg.key);
      value.partyKey = partyKey;

      const { itemId } = value.data;
      core.api['items'].updatePartyByItemId(itemId, partyKey);

      const type = value.type.replace(`item.${viewId}.`, '');
      if (type === 'change') {
        return [[uuid('change', partyKey, itemId, value.timestamp), value]];
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

            const localChange = partyManager.isPartyLocal(value.author, value.partyKey);

            events.emit(`${viewId}.logentry`, itemId, content, localChange, changes);
          }
        });
    },

    api: {
      async create(core, { type, title = 'Untitled', partyKey }) {
        return core.api['items'].create({ type, title, partyKey });
      },

      async getById(core, itemId) {
        const changes = (await core.api[viewId].getChanges(itemId)).map(({ data: { changes } }) => changes);
        const content = changes.map(serializeChanges).join('');

        const {
          data: { title, type }
        } = await core.api['items'].getInfo(itemId);

        return {
          itemId,
          type,
          title,
          content,
          changes
        };
      },
      // TODO(elmasse) Quick fix, this needs review. It might be better to use getChages and return the proper value from there.
      async getLogs(core, itemId) {
        const changes = (await core.api[viewId].getChanges(itemId));
        return changes.map(({ data: { changes } }) => changes);
      },

      async getChanges(core, itemId, opts = {}) {
        const { partyKey } = core.api['items'].getPartyForItemId(itemId);
        const query = { reverse: opts.reverse };
        const fromKey = uuid('change', partyKey, itemId, opts.lastChange);
        const toKey = `${uuid('change', partyKey, itemId)}~`;

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

      async appendChange(core, itemId, changes) {
        const { feed } = core.api['items'].getPartyForItemId(itemId);

        return append(feed, {
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

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

const makeTree = (items) => {
  const tree = {};
  items.forEach((item) => {
    const { data: { changes: { payload } } } = item;
    const parent = payload && payload.previous;
    if (!tree[parent]) {
      tree[parent] = [];
    }
    tree[parent].push(item);
  });

  return tree;
};

const hierarchicalSort = (tree, id, comparator, result) => {
  const children = tree[id];
  if (children) {
    children.sort(comparator).forEach((item) => {
      result.push(item);
      const { data: { changes: { payload } } } = item;
      hierarchicalSort(tree, payload.id, comparator, result);
    });
  }

  return result;
};

// TODO(burdon): Rename ChatLogView.
module.exports = function ChatLogsView(viewId, db, core, getFeed) {
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
        .forEach(async ({ value }) => {
          const event = value.type.replace(`item.${viewId}.`, '');
          events.emit(event, value);

          if (event === 'change') {
            const { itemId } = value.data;

            const changes = await core.api[viewId].getChanges(itemId);
            const content = changes.map(({ data: { changes } }) => changes).map(serializeChanges).join('');

            const localChange = value.author === getFeed().key.toString('hex');

            events.emit(`${viewId}.logentry`, itemId, content, localChange, changes);
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

      async getChanges(_, itemId, opts = {}) {
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
        const changes = await streamToList(reader);

        const sort = (a, b) => a.author.localeCompare(b.author);
        return hierarchicalSort(makeTree(changes), undefined, sort, []);
      },

      async appendChange(core, itemId, changes) {
        return append(getFeed(), {
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

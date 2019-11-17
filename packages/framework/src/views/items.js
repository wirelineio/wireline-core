//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const hyperid = require('hyperid');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');

const createId = hyperid({ urlSafe: true });

module.exports = function ItemsView(viewId, db, core, { append }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, 'items', { valueEncoding: 'json' });

  const timestampItems = new Map();

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith('item.')) {
        return [];
      }

      const { itemId } = value.data;

      const type = value.type.replace('item.', '');
      if (type === 'metadata') {
        if (timestampItems.get(itemId) >= value.timestamp) {
          return [];
        }

        timestampItems.set(itemId, value.timestamp);
        return [[uuid('metadata', itemId), value]];
      }

      return [];
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith('item'))
        .sort((a, b) => a.value.timestamp - b.value.timestamp)
        .forEach(async ({ value }) => {
          const event = value.type.replace('item.', '');
          events.emit(event, value);
        });
    },

    // TODO(burdon): Standardize method names.

    api: {
      // TODO(burdon): Remove default title.
      async create(core, { type, title = 'Untitled' }) {
        const itemId = createId();

        await core.api['items'].setInfo({
          itemId,
          type,
          title
        });

        return {
          itemId,
          type,
          title
        };
      },

      /**
       * @param core
       * @param opts {Object} options config
       * @param opts.archived {Boolean} Set to true to include archived items. Default to false.
       * @param opts.reverse {Boolean} Set to true to return items in reverse order. Default to false.
       */
      async getItems(core, { archived = false, reverse = false } = {}) {
        const fromKey = uuid('metadata');
        const toKey = `${fromKey}~`;
        const reader = viewDB.createValueStream({ gte: fromKey, lte: toKey, reverse });

        return streamToList(reader, (msg, next) => next(archived || !msg.data.archived));
      },

      /**
       * @param core
       * @param opts {Object} options config
       * @param opts.reverse {Boolean} Set to true to return items in reverse order. Default to false.
       */
      async getArchivedItems(core, { reverse = false } = {}) {
        const fromKey = uuid('metadata');
        const toKey = `${fromKey}~`;
        const reader = viewDB.createValueStream({ gte: fromKey, lte: toKey, reverse });

        return streamToList(reader, (msg, next) => next(!!msg.data.archived));
      },

      async getInfo(core, itemId) {
        return viewDB.get(uuid('metadata', itemId));
      },

      async setInfo(core, data) {
        let msg = {};
        try {
          msg = await core.api['items'].getInfo(data.itemId);
        } catch (e) {
          // eslint-disable-next-line no-empty
        }

        return append({ type: 'item.metadata', data: { ...msg.data, ...data } });
      },

      async archive(core, itemId) {
        await core.api['items'].setInfo({ itemId, archived: true });
      },

      async unarchive(core, itemId) {
        await core.api['items'].setInfo({ itemId, archived: false });
      },

      onChange(core, itemId, cb) {
        const handler = async ({ data: { itemId: id } }) => {
          if (id !== itemId) {
            return;
          }

          const { data } = await core.api['items'].getInfo(itemId);

          cb({ ...data });
        };

        events.on('metadata', handler);
        return () => {
          events.removeListener('metadata', handler);
        };
      },

      events
    }
  });
};

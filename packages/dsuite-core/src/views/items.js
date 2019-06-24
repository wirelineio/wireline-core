//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const hyperid = require('hyperid');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');
const { append } = require('../protocol/messages');

const createId = hyperid({ urlSafe: true });

module.exports = function ItemsView({ core, db, partyManager }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  let currentPartyKey;
  partyManager.on('party-changed', ({ partyKey: newPartyKey }) => {
    currentPartyKey = newPartyKey.toString('hex');
  });

  const viewDB = sub(db, 'items', { valueEncoding: 'json' });

  const partiesByItem = new Map();

  const timestampItems = new Map();

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith('item.')) {
        return [];
      }

      const partyKey = partyManager.getPartyKeyFromFeedKey(msg.key);
      value.partyKey = partyKey;

      const { itemId } = value.data;
      core.api['items'].updatePartyByItemId(itemId, partyKey);

      const type = value.type.replace('item.', '');
      if (type === 'metadata') {
        if (timestampItems.get(itemId) >= value.timestamp) {
          return [];
        }

        timestampItems.set(itemId, value.timestamp);
        return [[uuid('metadata', partyKey, itemId), value]];
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
      async create(core, { type, title = 'Untitled', partyKey }) {
        const itemId = createId();

        // eslint-disable-next-line no-param-reassign
        partyKey = partyKey || currentPartyKey;
        partiesByItem.set(itemId, {
          feed: partyManager.getLocalPartyFeed(partyKey),
          partyKey
        });

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

      async getItems(core, opts = {}) {
        const fromKey = uuid('metadata', opts.partyKey || currentPartyKey);
        const toKey = `${fromKey}~`;
        const reader = viewDB.createValueStream({ gte: fromKey, lte: toKey, reverse: opts.reverse });

        return streamToList(reader);
      },

      async getInfo(core, itemId) {
        const { partyKey } = core.api['items'].getPartyForItemId(itemId);
        return viewDB.get(uuid('metadata', partyKey, itemId));
      },

      async setInfo(core, data) {
        const { feed } = core.api['items'].getPartyForItemId(data.itemId);

        let msg = {};
        try {
          msg = await core.api['items'].getInfo(data.itemId);
        } catch (e) {
          // eslint-disable-next-line no-empty
        }

        return append(feed, { type: 'item.metadata', data: { ...msg.data, ...data } });
      },

      onChange(core, itemId, cb) {
        const handler = async ({ data: { itemId: id } }) => {
          if (id !== itemId) {
            return;
          }

          const { data } = await core.api['itmes'].getInfo(itemId);

          cb({ ...data });
        };

        events.on('metadata', handler);
        return () => {
          events.removeListener('metadata', handler);
        };
      },

      updatePartyByItemId(core, itemId, partyKey) {
        if (!partiesByItem.has(itemId)) {
          partiesByItem.set(itemId, {
            feed: partyManager.getLocalPartyFeed(partyKey),
            partyKey
          });
        }
      },

      getPartyForItemId(core, itemId) {
        return partiesByItem.get(itemId);
      },

      events
    }
  });
};

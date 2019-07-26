//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');
const Y = require('yjs');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');

module.exports = function DocumentsView(viewId, db, core, { append, isLocal, author }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, viewId, { valueEncoding: 'json' });

  // Map of Y.Doc elements.
  const documents = new Map();

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

          const doc = documents.get(value.data.itemId);

          if (event === 'change' && doc) {
            const { update } = value.data;

            // Apply and emit changes only when from remote doc.
            if (!isLocal(value)) {
              Y.applyUpdate(doc, update, value.author);
              events.emit(`${viewId}.remote-change`, value.data.itemId, { update, origin: value.author, doc });
            }
          }
        });
    },

    api: {
      async create(core, { type, title = 'Untitled' }) {
        const item = await core.api['items'].create({ type, title });
        await core.api[viewId].init({ itemId: item.itemId });
        return item;
      },

      async init(core, { itemId }) {
        // Local Yjs Doc for track changes.
        const doc = new Y.Doc();
        doc.clientID = author.toString('hex');

        // Send changes if local update occurs.
        doc.on('update', (update, origin) => {

          // Do not send remote changes.
          // Do not send init changes (loaded from feed at loading phase).
          if (origin !== doc.clientID || origin === 'init') return;

          append({
            type: `item.${viewId}.change`,
            data: { itemId, update }
          });
        });

        documents.set(itemId, doc);

        return { doc };
      },

      async getById(core, itemId) {

        await new Promise(resolve => this.ready(resolve));

        const { data: { title, type } } = await core.api['items'].getInfo(itemId);

        let doc = documents.get(itemId);

        if (!doc) {
          const updates = await core.api[viewId].getChanges(itemId);

          if (!updates) {
            throw new Error('Document not found:', itemId);
          }

          ({ doc } = await core.api[viewId].init({ itemId }));

          updates.forEach(({ data: { update } }) => {
            // Mark as an initial change so that it's not sent on update.
            Y.applyUpdate(doc, update, 'init');
          });
        }

        return {
          itemId,
          type,
          title,
          doc
        };
      },

      async getChanges(core, itemId, opts = {}) {
        const query = { reverse: opts.reverse };
        const fromKey = uuid('change', itemId, opts.lastChange);
        const toKey = `${uuid('change', itemId)}~`;

        if (opts.lastChange) {
          query.gt = fromKey;
        } else {
          query.gte = fromKey;
        }

        query.lte = toKey;

        const reader = viewDB.createValueStream(query);

        return streamToList(reader);
      },

      async appendChange(core, itemId, change) {
        const clientID = author.toString('hex');
        const { update } = change;

        const doc = documents.get(itemId);

        // Apply updates to view's doc.
        Y.applyUpdate(doc, update, clientID);
      },

      onChange(core, itemId, cb) {
        const handler = (id, { update, origin, doc }) => {
          if (id !== itemId) return;

          cb({
            itemId,
            update,
            origin,
            doc
          });
        };

        events.on(`${viewId}.remote-change`, handler);

        return () => {
          events.removeListener(`${viewId}.remote-change`, handler);
        };
      },

      events
    }
  });
};

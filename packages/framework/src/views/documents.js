//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');
const Y = require('yjs');

const { keyToHex } = require('@wirelineio/utils');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');

module.exports = function DocumentsView(viewId, db, core, { append, isLocal, author }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, viewId, { valueEncoding: 'json' });

  const eventCRDTChange = `${viewId}.crdt-change`;

  /**
   * @type{Map<string, Y.Doc>}
   */
  const documents = new Map();

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith(`item.${viewId}.`)) {
        return [];
      }

      const { itemId } = value.data;

      const type = value.type.replace(`item.${viewId}.`, '');
      if (type === 'change' || type === 'create') {
        return [[uuid(type, itemId, value.timestamp), value]];
      }

      return [];
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith(`item.${viewId}`))
        .sort((a, b) => a.value.timestamp - b.value.timestamp)
        .forEach(async ({ value }) => {
          const { type, data, author } = value;
          const event = type.replace(`item.${viewId}.`, '');

          events.emit(event, value);

          if (event === 'change' && !isLocal(value)) {
            const { itemId, update, selection } = data;

            if (!documents.has(itemId)) return;

            const doc = documents.get(itemId);

            Y.applyUpdate(doc, update, { source: 'remote', author, selection });
          }
        });
    },

    api: {
      async create(core, { type, title = 'Untitled' }) {
        const item = await core.api['items'].create({ type, title });
        await core.api[viewId].init(item.itemId);
        await append({
          type: `item.${viewId}.create`,
          data: { itemId: item.itemId }
        });

        return item;
      },

      async init(core, itemId) {
        // Local Yjs Doc for track changes.
        const doc = new Y.Doc();

        doc.on('update', async (update, origin) => {
          const { author, source, selection } = origin;

          if (source === 'local') {
            // Share update.
            await append({
              type: `item.${viewId}.change`,
              data: { itemId, update, selection }
            });

            return;
          }

          if (source === 'remote') {
            events.emit(eventCRDTChange, itemId, { update, author, selection });
          }
        });

        documents.set(itemId, doc);

        return doc;
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

          doc = await core.api[viewId].init(itemId);

          updates.forEach(({ data: { update } }) => {
            // Mark as an initial change so that it's not sent on update.
            Y.applyUpdate(doc, update, { source: 'init' });
          });
        }

        return {
          itemId,
          type,
          title,
          doc
        };
      },

      async appendChange(core, itemId, change) {
        const { update, selection } = change;
        const doc = documents.get(itemId);
        Y.applyUpdate(doc, update, { source: 'local', author: keyToHex(author), selection });
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

      onChange(core, itemId, cb) {
        const handler = (id, handlerParams) => {
          if (id !== itemId) return;

          cb({
            itemId,
            ...handlerParams
          });
        };

        events.on(eventCRDTChange, handler);

        return () => {
          events.removeListener(eventCRDTChange, handler);
        };
      },

      events
    }
  });
};

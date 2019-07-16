//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { createAutomergeWorker } = require('@wirelineio/automerge-worker');
const { keyToHex } = require('@wirelineio/utils');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');
const { append } = require('../protocol/messages');

module.exports = function DocumentsView(viewId, db, core, getFeed) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, viewId, { valueEncoding: 'json' });

  const automergeWorker = createAutomergeWorker();

  const {
    createDocument,
    getDocumentState,
    createDocumentFromChanges,
    applyChanges,
    getActorId,
    applyChangesFromOps,
    getDocumentContent
  } = automergeWorker;

  // TODO(burdon): ???
  automergeWorker.on('status', () => {
    events.emit('metric.kappa.document.status');
  });

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

          const state = await getDocumentState(value.data.itemId);

          if (event === 'change' && state) {
            const { itemId, changes } = value.data;

            // Apply changes only when from remote doc.
            const actorId = await getActorId(itemId);
            const localChange = value.author === actorId;
            if (!localChange) {
              await applyChanges(itemId, changes);
            }

            const content = await getDocumentContent(itemId);
            events.emit(`${viewId}.crdt`, itemId, content, localChange);
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
        const { changes } = await createDocument(keyToHex(getFeed().key), itemId);

        // Publish initial change
        await append(getFeed(), {
          type: `item.${viewId}.change`,
          data: { itemId, changes }
        });

        return {
          itemId
        };
      },

      async getById(core, itemId) {
        const actorId = keyToHex(getFeed().key);

        const {
          data: { title, type }
        } = await core.api['items'].getInfo(itemId);

        const state = await getDocumentState(itemId);

        if (!state) {
          let changes = await core.api[viewId].getChanges(itemId);

          if (!changes) {
            throw new Error('Document not found:', itemId);
          }

          // Flat batch changes
          changes = changes.reduce((all, { data: { changes } }) => {
            all.push(...changes);
            return all;
          }, []);

          await createDocumentFromChanges(actorId, itemId, changes);
        }

        const content = await getDocumentContent(itemId);

        return {
          itemId,
          type,
          title,
          content
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

      async appendChange(core, itemId, changes) {
        const automergeChanges = await applyChangesFromOps(itemId, changes);

        // Maybe not applied because debounce + batch
        if (automergeChanges) {
          return append(getFeed(), {
            type: `item.${viewId}.change`,
            data: { itemId, changes: automergeChanges }
          });
        }
      },

      onChange(core, itemId, cb) {
        const handler = (id, content, localChange) => {
          if (id !== itemId) return;

          cb({
            itemId,
            content,
            localChange
          });
        };

        events.on(`${viewId}.crdt`, handler);
        return () => {
          events.removeListener(`${viewId}.crdt`, handler);
        };
      },

      events
    }
  });
};

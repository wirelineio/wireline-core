//
// Copyright 2019 Wireline, Inc.
//

const view = require('kappa-view-level');
const EventEmitter = require('events');
const sub = require('subleveldown');

const { createAutomergeWorker } = require('@wirelineio/automerge-worker');

const { streamToList } = require('../utils/stream');
const { append } = require('../protocol/messages');

module.exports = function DocumentsView(dsuite, { viewId }) {
  const { uuid, db } = dsuite;

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

  automergeWorker.on('status', () => {
    dsuite.emit('metric.kappa.document.status');
  });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;

      if (!value.type.startsWith(`item.${viewId}.`)) {
        return [];
      }

      const type = value.type.replace(`item.${viewId}.`, '');

      const partyKey = dsuite.getPartyKeyFromFeedKey(msg.key);
      value.partyKey = partyKey;

      const { itemId } = value.data;

      dsuite.core.api.items.updatePartyByItemId(itemId, partyKey);

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
      async create(core, { type, title = 'Untitled', partyKey }) {
        const item = await core.api.items.create({ type, title, partyKey });
        await core.api[viewId].init({ itemId: item.itemId });
        return item;
      },

      async init(core, { itemId }) {
        const { feed } = core.api.items.getPartyForItemId(itemId);
        const { changes } = await createDocument(feed.key.toString('hex'), itemId);

        // Publish initial change
        await append(feed, {
          type: `item.${viewId}.change`,
          data: { itemId, changes }
        });

        return {
          itemId
        };
      },

      async getById(core, itemId) {
        const { feed } = core.api.items.getPartyForItemId(itemId);
        const actorId = feed.key.toString('hex');

        const {
          data: { title, type }
        } = await core.api.items.getInfo(itemId);

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
        const { partyKey } = core.api.items.getPartyForItemId(itemId);
        const query = { reverse: opts.reverse };
        const fromKey = uuid('change', partyKey, itemId, opts.lastChange);
        const toKey = `${uuid('change', partyKey, itemId)}~`;

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
        const { feed } = core.api.items.getPartyForItemId(itemId);
        const automergeChanges = await applyChangesFromOps(itemId, changes);

        // Maybe not applied because debounce + batch
        if (automergeChanges) {
          return append(feed, {
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

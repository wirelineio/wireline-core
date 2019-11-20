//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';
import kappa from 'kappa-core';
import createIndex from 'kappa-view-level';
import levelup from 'levelup';
import memdown from 'memdown';
import pify from 'pify';
import sub from 'subleveldown';

import { arrayFromStream } from './stream';

const log = debug('mixer');

// https://github.com/kappa-db/multifeed
// TODO(burdon): Move to kappa 5 (doesn't require multifeed).
export class MultifeedAdapter extends EventEmitter {

  /**
   * @param {FeedStore} feedStore
   * @param options
   */
  constructor(feedStore, options = {}) {
    super();

    console.assert(feedStore);
    this._feedStore = feedStore;
    this._feedStore.on('feed', (feed) => {
      // Required by kappa.
      this.emit('feed', feed);
    });

    this._filter = options.filter;
  }

  // NOTE: Deadlock unless called after feedStore is initialized.
  async ready(cb) {
    await this._feedStore.ready();
    if (cb) {
      cb();
    }
  }

  feeds() {
    // TODO(burdon): Push more advanced filter into feedstore.
    return this._feedStore.filterFeeds(({ path }) => {
      return path.indexOf(this._filter) !== -1;
    });
  }
}

// Ensures lexical sorting.
// import charwise from 'charwise';
// export const createKey = (...args) => args.filter(Boolean).map(charwise.encode).join('/');
export const createKey = (...args) => args.join('/');

const viewName = 'messages';

// TODO(burdon): Factor out.
const createMessageView = (db, id, subscriptions) => {

  let n = 0;

  // TODO(burdon): Move data into CRDT.
  // https://github.com/Level/subleveldown
  const viewDB = sub(db, id, { valueEncoding: 'json' });

  // https://github.com/noffle/kappa-view-level
  return createIndex(viewDB, {

    // TODO(burdon): Filter based on type.
    map: (message) => {
      // TODO(burdon): Decode here.
      const { bucketId } = message.value;
      if (bucketId) {
        // TODO(burdon): Random order: plug-in CRDT.
        const key = createKey(bucketId, ++n);
        return [
          [key, message.value]
        ];
      }

      return [];
    },

    // TODO(burdon): Better way to trigger update?
    indexed: (messages) => {
      log('indexed', messages.length);

      const buckets = new Set();
      messages.forEach(({ value: { bucketId } }) => buckets.add(bucketId));

      subscriptions.forEach(({ bucketId, callback }) => {
        if (buckets.has(bucketId)) {
          callback();
        }
      });
    },

    api: {
      getMessage: async (kappa, key) => {
        return viewDB.get(key).catch(() => null);
      },

      getMessages: async (kappa, bucketId) => {
        const stream = viewDB.createValueStream({
          gte: createKey(bucketId, ''),
          lte: createKey(bucketId, '~')
        });

        return arrayFromStream(stream);
      }
    }
  });
};

/**
 * De-multiplexes messages into buckets.
 */
export class Mixer {

  _subscriptions = new Set();

  constructor(multifeed, codec) {
    console.assert(multifeed);
    console.assert(codec);

    this._codec = codec;

    // TODO(burdon): Remove.
    // https://github.com/kappa-db/kappa-core
    this._kappa = kappa(null, {
      multifeed
    });
  }

  subscribe(bucketId, callback) {
    const subscription = { bucketId, callback };
    this._subscriptions.add(subscription);

    return {
      close: () => this._subscriptions.delete(subscription)
    };
  }

  async initialize() {
    // https://github.com/Level/levelup#api
    const db = levelup(memdown());

    // TODO(burdon): App data, separate from system messages, etc.
    this._kappa.use(viewName, createMessageView(db, viewName, this._subscriptions));

    await pify(this._kappa.ready.bind(this._kappa))(viewName);

    return this;
  }

  get api() {
    return this._kappa.api[viewName];
  }
}

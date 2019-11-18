//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import kappa from 'kappa-core';
import createIndex from 'kappa-view-level';
import levelup from 'levelup';
import memdown from 'memdown';
import pify from 'pify';
import sub from 'subleveldown';

import { arrayFromStream } from './util';

// https://github.com/kappa-db/multifeed
// TODO(burdon): Move to kappa 5 (doesn't require multifeed).
export class MultifeedAdapter extends EventEmitter {

  constructor(feedStore) {
    super();

    console.assert(feedStore);
    this._feedStore = feedStore;
    this._feedStore.on('feed', (feed) => {
      // console.log('New:', feed.key);

      // Required by kappa.
      this.emit('feed', feed);
    });
  }

  // NOTE: Deadlock unless called after feedStore is initialized.
  async ready(cb) {
    // process.nextTick(() => {
    //   cb();
    // });

    await this._feedStore.ready();
    if (cb) {
      cb();
    }
  }

  feeds() {
    return this._feedStore.getFeeds();
  }
}

const viewName = 'messages';

// Ensures lexical sorting.
// import charwise from 'charwise';
// export const createKey = (...args) => args.filter(Boolean).map(charwise.encode).join('/');
export const createKey = (...args) => args.join('/');

const createMessageView = (db, id, subscriptions) => {

  let n = 0;

  // https://github.com/Level/subleveldown
  const viewDB = sub(db, id, { valueEncoding: 'json' });

  // TODO(burdon): All in memory; retrieve payload from disk?
  // https://github.com/noffle/kappa-view-level
  return createIndex(viewDB, {

    // TODO(burdon): Filter based on type.
    map: (message) => {
      const { bucketId } = message.value;
      if (bucketId) {
        // TODO(burdon): Order by?
        const key = createKey(bucketId, ++n);
        return [
          [key, message.value]
        ];
      }

      return [];
    },

    // TODO(burdon): Better way to trigger update?
    indexed: (messages) => {
      const buckets = new Set();
      messages.forEach(({ value: { bucketId } }) => buckets.add(bucketId));

      subscriptions.forEach(({ bucketId, callback }) => {
        if (buckets.has(bucketId)) {
          callback();
        }
      });
    },

    api: {
      get: async (kappa, key) => {
        return viewDB.get(key).catch(() => null);
      },

      // TODO(burdon): Return stream each time? Cursor from last change?
      // TODO(burdon): Get multiple buckets if desired. CRDT consumes this stream.
      getMessages: async (kappa, bucketId) => {
        const stream = viewDB.createKeyStream({
          gte: createKey(bucketId, ''),
          lte: createKey(bucketId, '~')
        });

        // stream
        //   .on('data', (data) => {
        //     console.log(data.key, '=', data.value);
        //   })
        //   .on('error', (err) => {
        //     console.error(err);
        //   })
        //   .on('close', () => {
        //     console.log('closed');
        //   })
        //   .on('end', () => {
        //     console.log('ended');
        //   });

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

  constructor(feedStore, codec) {
    console.assert(feedStore);
    console.assert(codec);

    // TODO(burdon): Not used.
    this._codec = codec;

    // https://github.com/kappa-db/kappa-core
    this._kappa = kappa(null, {
      multifeed: new MultifeedAdapter(feedStore)
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

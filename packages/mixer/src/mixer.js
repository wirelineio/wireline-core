//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import kappa from 'kappa-core';
import view from 'kappa-view-level';
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

// TODO(burdon): App data, separate from system messages, etc.
const createMessageView = (db, id, callback) => {

  let n = 0;

  // https://github.com/Level/subleveldown
  const viewDB = sub(db, id, { valueEncoding: 'json' });

  // https://github.com/noffle/kappa-view-level
  return view(viewDB, {
    map: async (message) => {

      // TODO(burdon): Filter based on type.
      const { bucketId } = message.value;
      if (bucketId) {
        const key = `${bucketId}:${++n}`;
        console.log('map', key);
        return [
          [key, message.value]
        ];
      }

      return [];
    },

    // TODO(burdon): Better way to trigger update?
    indexed: (messages) => {
      console.log('index', messages.length);
      process.nextTick(() => {
        callback();
      });
    },

    api: {
      get: async (id) => {
        return viewDB.get(id).catch(() => null);
      },

      // TODO(burdon): Return stream each time? Cursor from last change?
      // TODO(burdon): Get multiple buckets if desired. CRDT consumes this stream.
      getMessages: async (kappa, bucketId) => {
        const stream = viewDB.createKeyStream({
          gte: `${bucketId}:`,
          lte: `${bucketId}:~`
        });

        const messages = await arrayFromStream(stream);
        console.log('GET', bucketId, messages.length);
        return messages;
      }
    }
  });
};

/**
 * De-multiplexes messages into buckets.
 */
export class Mixer {

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

  setCallback(callback) {
    this.callback = callback;
    return this;
  }

  async initialize() {
    // https://github.com/Level/levelup#api
    const db = levelup(memdown());

    this._kappa.use(viewName, createMessageView(db, viewName, this.callback));

    await pify(this._kappa.ready.bind(this._kappa))(viewName);

    return this;
  }

  get api() {
    return this._kappa.api[viewName];
  }
}

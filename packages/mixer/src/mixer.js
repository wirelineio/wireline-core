//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import kappa from 'kappa-core';
import view from 'kappa-view-level';
import levelup from 'levelup';
import memdown from 'memdown';
import sub from 'subleveldown';

// https://github.com/kappa-db/multifeed
// TODO(burdon): Move to kappa 5 (doesn't require multifeed).
export class MultifeedAdapter extends EventEmitter {

  constructor(feedStore) {
    super();

    console.assert(feedStore);
    this._feedStore = feedStore;
    this._feedStore.on('feed', (feed) => {
      console.log('New:', feed);

      // For kappa.
      this.emit('feed', feed);
    });
  }

  ready(cb) {
    process.nextTick(() => {
      cb();
    });
  }

  feeds() {
    return this._feedStore.getFeeds();
  }
}

/**
 * De-multiplexes messages into buckets.
 */
export class Mixer {

  constructor(multifeed, typeDictionary) {
    console.assert(multifeed);
    console.assert(typeDictionary);

    this._typeDictionary = typeDictionary;

    // https://github.com/kappa-db/kappa-core
    this._kappa = kappa(null, { multifeed });

    const db = levelup(memdown());
    const store = sub(db, 'test', { valueEncoding: 'json' });

    const messages = [];
    this._kappa.use('test', 1, view(store, {
      map(entries) {
        messages.push(entries);
        // console.log(entries);
      },

      indexed(entries) {
        // console.log(entries);
      },

      api: {
        messages: () => {
          return messages;
        }
      }
    }));
  }

  get messages() {
    return this._kappa.api['test'].messages();
  }

  // TODO(burdon): Stream?
  subscribe(bucketId) {
    console.log(bucketId);
    return this;
  }
}

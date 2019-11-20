//
// Copyright 2019 Wireline, Inc.
//

import chance from 'chance';
import createIndex from 'kappa-view-level';
import crypto from 'hypercore-crypto';
import { EventEmitter } from 'events';
import hypertrie from 'hypertrie';
import kappa from 'kappa-core';
import levelup from 'levelup';
import memdown from 'memdown';
import pify from 'pify';
import sub from 'subleveldown';
import ram from 'random-access-memory';

import { FeedStore } from '@dxos/feed-store';

import { arrayFromStream } from './stream';

jest.setTimeout(10000);

/**
 * Implements multifeed API.
 * https://github.com/kappa-db/multifeed
 */
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
      return !this._filter || path.indexOf(this._filter) !== -1;
    });
  }
}

// Ensures lexical sorting.
// import charwise from 'charwise';
// export const createKey = (...args) => args.filter(Boolean).map(charwise.encode).join('/');
export const createKey = (...args) => args.join('/');

/**
 * Test kappa view.
 * @param db
 * @param id
 * @param callback
 * @return {{maxBatch, fetchState, indexed, storeState, api, map}}
 */
const createTestView = (db, id, callback) => {
  console.assert(callback);

  let n = 0;

  // https://github.com/Level/subleveldown
  const viewDB = sub(db, id, { valueEncoding: 'json' });

  // https://github.com/noffle/kappa-view-level
  return createIndex(viewDB, {

    map: (message) => {
      const { value: { bucketId } } = message;
      if (bucketId) {
        const key = createKey(bucketId, ++n);
        return [
          [key, message.value]
        ];
      }

      return [];
    },

    indexed: () => {
      callback();
    },

    api: {
      getMessages: async (kappa, bucketId) => {
        console.assert(bucketId);
        const stream = viewDB.createValueStream({
          gte: createKey(bucketId, ''),
          lte: createKey(bucketId, '~')
        });

        return arrayFromStream(stream);
      }
    }
  });
};

const viewName = 'test';

test('basic multiplexing', async (done) => {

  const { publicKey, secretKey } = crypto.keyPair();
  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  await feedStore.initialize();

  // https://github.com/kappa-db/kappa-core
  const core = kappa(null, {
    multifeed: new MultifeedAdapter(feedStore, {
      filter: 'party-1'
    })
  });

  // https://github.com/Level/levelup#api
  const db = levelup(memdown());

  // Test index.
  core.use(viewName, createTestView(db, viewName, async () => {
    const items = await core.api[viewName].getMessages('bucket-1');

    // TODO(burdon): Count actual data.
    if (items.length === 2) {
      done();
    }
  }));

  await pify(core.ready.bind(core))(viewName);

  const items = await core.api[viewName].getMessages('bucket-1');
  expect(items).toHaveLength(0);

  // const peers = ['peer-1', 'peer-2'];
  // const parties = ['party-1', 'party-2'];
  const buckets = ['bucket-1', 'bucket-2'];

  const feeds = [
    await feedStore.openFeed('/peer-1/party-1'),
    await feedStore.openFeed('/peer-2/party-1'),
    await feedStore.openFeed('/peer-2/party-2')
  ];

  expect(feedStore.getFeeds()).toHaveLength(3);

  const random = chance(0);

  // TODO(burdon): Higher numbers fail?
  for (let i = 0; i < 5; i++) {
    const message = {
      bucketId: random.pick(buckets),
      title: random.name()
    };

    const feed = random.pick(feeds);
    feed.append(message);
  }

  // TODO(burdon): When is it safe to close?
  // feedStore.close();
});

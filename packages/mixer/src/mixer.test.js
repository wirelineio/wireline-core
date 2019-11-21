//
// Copyright 2019 Wireline, Inc.
//

// import debug from 'debug';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';

import { FeedStore } from '@dxos/feed-store';

// import { Mixer } from './mixer';

// const log = debug('test');

test.skip('basic multiplexing', async () => {

  const { publicKey, secretKey } = crypto.keyPair();
  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  await feedStore.initialize();

  // TODO(burdon): Register processors bound to queries and dispatch.
  // const mixer = new Mixer(feedStore);
  // const sub = mixer.subscribe({ bucketId: 'bucket-1' }, handler);

  const feeds = {
    'party-1': [
      await feedStore.openFeed('/peer-1/party-1'),
      await feedStore.openFeed('/peer-2/party-1'),
    ],
    'party-2': [
      await feedStore.openFeed('/peer-2/party-2'),
    ]
  };

  expect(feedStore.getFeeds()).toHaveLength(3);

  const items = {
    'party-1': [
      { bucketId: 'system',   value: 0 },
      { bucketId: 'bucket-1', value: 1 },   // match
      { bucketId: 'bucket-2', value: 2 },
      { bucketId: 'bucket-1', value: 3 },   // match
      { bucketId: 'bucket-1', value: 4 },   // match
      { bucketId: 'bucket-2', value: 5 },
    ],
    'party-2': [
      { bucketId: 'system',   value: 0 },
      { bucketId: 'bucket-1', value: 1 },
      { bucketId: 'bucket-1', value: 2 },
    ]
  };

  // Write data to feeds.
  Object.keys(items).forEach((party) => {
    items[party].forEach((item, i) => {
      feeds[party][i % feeds[party].length].append(item);
    });
  });
});

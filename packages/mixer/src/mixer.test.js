//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';

import { FeedStore } from '@dxos/feed-store';

import { Mixer, MultifeedAdapter } from './mixer';

const log = debug('test');

test('sanity', () => {
  expect(true).toBeTruthy();
});

test('basic multiplexing', async (done) => {

  const { publicKey, secretKey } = crypto.keyPair();
  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  await feedStore.initialize();

  const multifeed = new MultifeedAdapter(feedStore, { filter: 'party-1' });

  const mixer = new Mixer(multifeed);

  let count = 0;
  mixer.subscribe('bucket-1', async () => {
    const items = await mixer.api.getMessages('bucket-1');
    log('updated', items);
    count = items.length;
  });

  await mixer.initialize();

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

  await waitForExpect(async () => {
    expect(count).toEqual(3);

    const items = await mixer.api.getMessages('bucket-1');
    expect(items).toHaveLength(3);

    await feedStore.close();

    done();
  });
});

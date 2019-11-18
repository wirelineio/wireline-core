//
// Copyright 2019 Wireline, Inc.
//

import ram from 'random-access-memory';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import waitForExpect from 'wait-for-expect';

// TODO(burdon): Takes 5s to load
import { FeedStore } from '@dxos/feed-store';
import { Codec } from '@wirelineio/protobuf';

import { Mixer, createKey } from './mixer';

const codec = new Codec().addJson(require('./schema.json'));

// TODO(burdon): Debug logging.

jest.setTimeout(10000);

// TODO(burdon): Empty test takes 7s.
test('sanity', () => {
  expect(true).toBeTruthy();
});

test('basic multiplexing', async (done) => {

  // TODO(burdon): What are the codecs for? Is this a hypercore concept? Currently serializing JSON -- WHY"
  // TODO(burdon): Larger test with protocol and swarm (no framework/megafeed).
  // TODO(burdon): Error handling.

  const { publicKey, secretKey } = crypto.keyPair();
  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  await feedStore.initialize();

  const mixer = new Mixer(feedStore, codec);

  let count = 0;
  mixer.subscribe('bucket-1', async () => {
    const items = await mixer.api.getMessages('bucket-1');
    // console.log('updated', items);
    count = items.length;
  });

  await mixer.initialize();

  // TODO(burdon): What does the path represent?
  const feeds = [
    await feedStore.openFeed('/test/1'),
    await feedStore.openFeed('/test/2')
  ];

  expect(feedStore.getFeeds()).toHaveLength(feeds.length);

  const items = [
    { bucketId: 'bucket-1', value: 100 },
    { bucketId: 'bucket-2', value: 101 },
    { bucketId: 'bucket-1', value: 102 },
    { bucketId: 'bucket-1', value: 103 },
    { bucketId: 'bucket-2', value: 104 },
  ];

  items.forEach((item, i) => {
    feeds[i % feeds.length].append(item);
  });

  await waitForExpect(async () => {
    expect(count).toEqual(3);

    const item = await mixer.api.get(createKey('bucket-1', 1));
    expect(item).not.toBeNull();

    const items = await mixer.api.getMessages('bucket-1');
    expect(items).toHaveLength(3);

    await feedStore.close();

    done();
  });
});

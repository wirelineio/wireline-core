//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';

// TODO(burdon): Takes 5s to load
import { FeedStore } from '@dxos/feed-store';

import { Mixer, MultifeedAdapter } from './mixer';

const log = debug('test');

jest.setTimeout(10000);

test('sanity', () => {
  expect(true).toBeTruthy();
});

test('basic multiplexing', async (done) => {

  // TODO(burdon): Review FeedStore.
  // TODO(burdon): What are the codecs for? Is this a hypercore concept? Currently serialized as JSON?
  // TODO(burdon): Document what is stored, indexed, etc. (avoid multiple copies).
  // TODO(burdon): Test CRDT plugins to mixer (streams?)
  // TODO(burdon): Larger test with protocol and swarm (no framework/megafeed).
  // TODO(burdon): Systematize testing.
  // TODO(burdon): Error handling.

  const { publicKey, secretKey } = crypto.keyPair();
  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  await feedStore.initialize();

  const multifeed = new MultifeedAdapter(feedStore, { filter: 'party-1' });

  // TODO(burdon): Configure CRDT.
  const mixer = new Mixer(multifeed);

  // TODO(burdon): Stream from last point.
  // new ChessModel().attach(mixer.subscribe({ bucketId }));
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
      // TODO(burdon): Encode here (wrap with Writer that has appropriate codecs).
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

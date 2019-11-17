//
// Copyright 2019 Wireline, Inc.
//

import ram from 'random-access-memory';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import pify from 'pify';

import { FeedStore } from '@dxos/feed-store';
import { TypeFactory } from '@wirelineio/protobuf';

import { MultifeedAdapter, Mixer } from './mixer';

const typeFactory = new TypeFactory().parse(require('./schema.json'));

test('basic multiplexing', async (done) => {

  // TODO(burdon): Error handling.

  // TODO(burdon): Larger test with protocol and swarm (no framework/megafeed).

  // TODO(burdon): What are the codecs for? Is this a hypercore concept? Currently serializing JSON -- WHY"

  const { publicKey, secretKey } = crypto.keyPair();
  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  const multifeed = new MultifeedAdapter(feedStore);

  const mixer = new Mixer(multifeed, typeFactory);

  // TODO(burdon): Stream, batch.
  const subscription = mixer.subscribe({ bucketId: 'bucket-1' }, () => {
    if (mixer.messages.length === 2) {
      subscription.close();
      done();
    }
  });

  // TODO(burdon): Order is important (after mixer created).
  await feedStore.initialize();

  // TODO(burdon): What does the path represent?
  const feed = await feedStore.openFeed('/test');
  await pify(feed.ready.bind(feed))();

  feed.append({ bucketId: 'bucket-1' });
  feed.append({ bucketId: 'bucket-1' });
  feed.append({ bucketId: 'bucket-2' });

  // TODO(burdon): Why does the test task 8s?

  // TODO(burdon): Close everything. Feedstore?
  // await pify(feed.close.bind(feed))();
});

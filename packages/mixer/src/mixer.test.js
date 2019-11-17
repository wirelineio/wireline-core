//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import ram from 'random-access-memory';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import pify from 'pify';

import { FeedStore } from '@dxos/feed-store';
import { Codec } from '@wirelineio/protobuf';

import { MultifeedAdapter, Mixer } from './mixer';

const codec = new Codec().addJson(require('./schema.json'));

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

  const multifeed = new MultifeedAdapter(feedStore);

  const mixer = new Mixer(multifeed, codec);

  const events = new EventEmitter();

  // TODO(burdon): Stream, batch.
  const subscription = mixer.subscribe({ bucketId: 'bucket-1' }, () => {
    if (mixer.messages.length === 3) {
      subscription.close();
      events.emit('close');
    }
  });

  // TODO(burdon): Order is important (after mixer created).
  await feedStore.initialize();

  // TODO(burdon): What does the path represent?
  const feed1 = await feedStore.openFeed('/test/1');
  const feed2 = await feedStore.openFeed('/test/2');
  await pify(feed1.ready.bind(feed1))();
  await pify(feed2.ready.bind(feed2))();

  expect(feedStore.getFeeds()).toHaveLength(2);

  feed1.append({ bucketId: 'bucket-1' });
  feed1.append({ bucketId: 'bucket-2' });
  feed2.append({ bucketId: 'bucket-1' });
  feed1.append({ bucketId: 'bucket-1' });

  // TODO(burdon): Why does the test take 7s?
  events.once('close', async () => {
    await feedStore.close();
    done();
  });
});

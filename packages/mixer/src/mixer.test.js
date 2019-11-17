//
// Copyright 2019 Wireline, Inc.
//

import ram from 'random-access-memory';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import pify from 'pify';
import waitForExpect from 'wait-for-expect';

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

  // TODO(burdon): Order is important (after mixer created).
  await feedStore.initialize();

  // TODO(burdon): What does the path represent?
  const feed = await feedStore.openFeed('/test');

  // TODO(burdon): Add core to feedstore and write message. Wrap and valiate protobuf.
  await pify(feed.ready.bind(feed))();
  await pify(feed.append.bind(feed))({ value: 100 });
  expect(feed.length).toBe(1);

  setTimeout(async () => {
    // TODO(burdon): Wait for view/subscription update.
    expect(mixer.messages).toHaveLength(1);
    console.log(mixer.messages);

    // TODO(burdon): Async close.
    await pify(feed.close.bind(feed))();

    done();
  }, 500);
});

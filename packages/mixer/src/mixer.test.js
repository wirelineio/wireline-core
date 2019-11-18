//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import ram from 'random-access-memory';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import pify from 'pify';

// TODO(burdon): Taskes 5s to load
import { FeedStore } from '@dxos/feed-store';
import { Codec } from '@wirelineio/protobuf';

import { Mixer } from './mixer';

const codec = new Codec().addJson(require('./schema.json'));

// TODO(burdon): Debug logging.

jest.setTimeout(10000);

// TODO(burdon): Empty test takes 7s.
test.skip('sanity', () => {
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

  // const events = new EventEmitter();

  // let done = false;

  // TODO(burdon): key with 'state'?
  mixer.setCallback(async () => {
    const item = await mixer.api.get('bucket-1:1');
    console.log('>>>>>>>>>>>>>>>', item);

  //   // const messages = await mixer.getMessages('bucket-1');
  //   // console.log('messages', messages);
  //
  //   // mixer.getMessages('bucket1')
  //   //   .on('data', (data) => {
  //   //     console.log(data.key, '=', data.value);
  //   //   })
  //   //   .on('error', (err) => {
  //   //     console.error(err);
  //   //   })
  //   //   .on('close', () => {
  //   //     console.log('closed');
  //   //   })
  //   //   .on('end', () => {
  //   //     console.log('ended');
  //   //   });
  });

  await mixer.initialize();

  // TODO(burdon): What does the path represent?
  const feed1 = await feedStore.openFeed('/test/1');
  const feed2 = await feedStore.openFeed('/test/2');

  expect(feedStore.getFeeds()).toHaveLength(2);

  // const items = [
  //   { id: 'item:1', value: 100 },
  //   { id: 'item:2', value: 101 },
  //   { id: 'item:3', value: 102 },
  //   { id: 'item:4', value: 103 },
  //   { id: 'test:1', value: 104 },
  // ];

  // feed1.append({ bucketId: 'bucket-1', value: 1 });
  // feed1.append({ bucketId: 'bucket-2', value: 2 });
  // feed2.append({ bucketId: 'bucket-1', value: 3 });
  // feed1.append({ bucketId: 'bucket-1', value: 4 });

  await pify(feed1.append.bind(feed1))({ bucketId: 'bucket-1', value: 1 });

  // events.once('close', async () => {
  //   await feedStore.close();
  //   done();
  // });

  setTimeout(async () => {
    console.log('<><><><><><><');
    const item = await mixer.api.get('bucket-1:1');
    expect(item).not.toBeNull();

    done();
  }, 2000);
});

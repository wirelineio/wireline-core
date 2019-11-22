//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';

import { FeedStore } from '@dxos/feed-store';

import { Mixer, feedKey } from './mixer';

const log = debug('test');

test('basic multiplexing', async (done) => {

  const { publicKey, secretKey } = crypto.keyPair();

  const credentialBulder = publicKey => ({
    __type_url: '.testing.Credential',
    publicKey
  });

  const mutationBulder = (property, value) => ({
    __type_url: '.testing.Mutation',
    property,
    value
  });

  const messages = {
    'party-1': [
      { bucketId: 'system',   payload: credentialBulder(publicKey) },
      { bucketId: 'bucket-1', payload: mutationBulder('a', 1) },      // match
      { bucketId: 'bucket-2', payload: mutationBulder('a', 1) },
      { bucketId: 'bucket-1', payload: mutationBulder('b', 1) },      // match
      { bucketId: 'bucket-1', payload: mutationBulder('b', 1) },      // match
      { bucketId: 'bucket-2', payload: mutationBulder('a', 1) },
    ],
    'party-2': [
      { bucketId: 'system',   payload: mutationBulder('a', 1) },
      { bucketId: 'bucket-1', payload: mutationBulder('b', 1) },
      { bucketId: 'bucket-1', payload: mutationBulder('c', 1) },
    ]
  };

  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'json'
    }
  });

  await feedStore.initialize();

  let count = 0;
  const mixer = new Mixer(feedStore);
  const stream = mixer.createKeyStream(feedKey('.*', 'party-1'), { bucketId: 'bucket-1' });

  // TODO(burdon): Should be 'append' like hypercore?
  stream.on('data', (message) => {
    log(message);

    if (++count === messages['party-1'].length) {
      done();
    }
  });

  const feeds = {
    'party-1': [
      await feedStore.openFeed(feedKey('peer-1', 'party-1')),
      await feedStore.openFeed(feedKey('peer-2', 'party-1')),
    ],
    'party-2': [
      await feedStore.openFeed(feedKey('peer-2', 'party-2')),
    ]
  };

  expect(feedStore.getFeeds()).toHaveLength(3);

  // Write data to feeds.
  Object.keys(messages).forEach((party) => {
    messages[party].forEach((message, i) => {
      const feed = feeds[party][i % feeds[party].length];

      feed.append(message);
    });
  });
});

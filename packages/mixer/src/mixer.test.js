//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';

import { FeedStore } from '@dxos/feed-store';
import { Codec } from '@wirelineio/codec-protobuf';

import { Mixer, feedKey } from './mixer';

const schema = require('./schema.json');
const types = require('./testing/types.json');

const log = debug('test');
debug.enable('test');

test('basic multiplexing', async (done) => {

  //
  // Data
  //

  const { publicKey, secretKey } = crypto.keyPair();

  const bucketBuilder = (bucketId, publicKey, title) => ({
    bucketId,
    payload: {
      __type_url: '.dxos.BucketGenesis',
      publicKey,
      meta: {
        title
      }
    }
  });

  const mutationBulder = (bucketId, property, value) => ({
    bucketId,
    payload: {
      __type_url: '.testing.Mutation',
      property,
      value
    }
  });

  const chessBulder = (bucketId, from, to) => ({
    bucketId,
    payload: {
      __type_url: '.testing.Chess',
      from,
      to
    }
  });

  const messages = {
    'party-1': [
      bucketBuilder('bucket-1', 'Bucket 1'),
      mutationBulder('bucket-1', 'title', 'Title 1'),

      chessBulder('bucket-1', 'e2', 'e4'),

      bucketBuilder('bucket-2', 'Bucket 2'),
      mutationBulder('bucket-2', 'title', 'Title 2'),
      mutationBulder('bucket-2', 'title', 'Title 3'),
    ],
    'party-2': [
      bucketBuilder('bucket-3', 'Bucket 3'),
      mutationBulder('bucket-3', 'title', 'Title 4'),
      mutationBulder('bucket-3', 'title', 'Title 5'),
    ]
  };

  //
  // FeedStore
  //

  const options = {
    rootTypeUrl: '.dxos.Message'
  };

  const codec = new Codec(options)
    .addJson(schema)
    .addJson(types)
    .build();

  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: {
      valueEncoding: 'mixer'
    },
    codecs: {
      mixer: codec
    }
  });

  await feedStore.initialize();

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

  //
  // Mixer
  //

  const mixer = new Mixer(feedStore);

  //
  // Streams
  //

  let count = 0;
  const buckets = new Map();
  mixer.createKeyStream(feedKey('.*', 'party-1'), {
    types: ['.dxos.BucketGenesis']
  })
    .on('data', (message) => {
      const { bucketId, meta } = message;
      buckets.set(bucketId, meta);

      // Separate stream for each bucket.
      const appStream = mixer.createKeyStream(feedKey('.*', 'party-1'), {
        bucketId,
        types: ['.dxos.BucketGenesis', '.testing.Mutation']
      });

      appStream.on('data', ({ payload }) => {
        log(bucketId, JSON.stringify(payload));
        if (++count === 5) {
          appStream.end();
          done();
        }
      });
    });

  //
  // Write data to feeds.
  //

  Object.keys(messages).forEach((party) => {
    messages[party].forEach((message, i) => {
      const feed = feeds[party][i % feeds[party].length];

      feed.append(message);
    });
  });
});

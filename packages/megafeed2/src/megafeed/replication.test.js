//
// Copyright 2019 Wireline, Inc.
//

import bufferFrom from 'buffer-from';
import debug from 'debug';
import ram from 'random-access-memory';
import pump from 'pump';
import waitForExpect from 'wait-for-expect';

import { keyStr } from '../util/keys';
import { Extension, Protocol } from '../protocol';

import { createFeedMap, createKeys } from './debug/generator';
import { FeedMap } from './feedmap';

debug.enable('test,protocol');

// TODO(burdon): Remove test and instead test replicator object.
test('feed map replication', async (done) => {
  const numFeedsPerTopic = 2;
  const numMessagesPerFeed = 5;

  // Generate feedMap used by the first peer.
  const topicKeys = createKeys(2);

  // Rendezvous key for protocol handshake.
  const [ rendezvousKey ] = createKeys(1);

  const map1 = new Map();

  const feedMap1 = await createFeedMap({ map: map1, topicKeys, numFeedsPerTopic, numMessagesPerFeed });

  // Generate an empty feedMap which will be populated after replication.
  const map2 = new Map();
  const feedMap2 = await createFeedMap({ map: map2 });

  // Extension configuration options.
  const extension = 'keys';
  const timeout = 1000;

  // Vars used across blocks.
  let protocol1;
  let protocol2;

  const createRpcHandler = ({ feedMap }) => {
    return async (protocol, context, { type, topics }) => {
      // Check credentials.
      if (!context.user) {
        throw new Error('Not authorized');
      }

      switch (type) {
        case 'list': {
          return {
            topics: await feedMap.getTopics()
          };
        }

        case 'request': {
          const results = await Promise.all(topics.map(async (topic) => {
            const feeds = await feedMap.getFeedsByTopic(topic);
            const keys = feeds.map(({ feed }) => keyStr(feed.key)) || [];

            // Share and replicate feeds over protocol stream.
            await Promise.all(keys.map(async (key) => {
              protocol.stream.feed(key);
              const { feed } = await feedMap.getFeed(key);
              feed.replicate({ live: true, stream: protocol.stream });
            }));

            return { topic, keys };
          }));

          return {
            topics: results
          }
        }

        // Error.
        default: {
          throw new Error('Invalid type: ' + type);
        }
      }
    }
  };

  const createHandshakeHandler = (feedMap) => {
    return async (protocol) => {
      const keys = protocol.getExtension(extension);

      {
        // Ask peer for topics.
        const { response: { topics } } = await keys.send({ type: 'list' });

        // Ask peer for topic feeds and replicate.
        const { response: { topics: feedsByTopic } } = await keys.send({ type: 'request', topics });
        feedsByTopic.forEach(async ({ topic, keys }) => {
          await Promise.all(keys.map(async (key) => {
            const { feed, meta } = await FeedMap.createFeed(
              ram, bufferFrom(key, 'hex'), { valueEncoding: 'json' });

            await feedMap.upsertFeed(feed, { ...meta, topic });

            // Share and replicate feeds over protocol stream.
            protocol.stream.feed(key);
            feed.replicate({ live: true, stream: protocol.stream });
          }));
        });
      }
    };
  };

  {
    protocol1 = await new Protocol()
      .setUserData({ user: 'user1' })
      .setHandshakeHandler(createHandshakeHandler(feedMap1))
      .setExtension(new Extension(extension, { timeout })
        .setMessageHandler(createRpcHandler({ topicKeys, feedMap: feedMap1 })))
      .init(rendezvousKey);
  }

  {
    protocol2 = await new Protocol()
      .setUserData({ user: 'user2' })
      .setHandshakeHandler(createHandshakeHandler(feedMap2))
      .setExtension(new Extension(extension, { timeout })
        .setMessageHandler(createRpcHandler({ topicKeys, feedMap: feedMap2 })))
      .init(rendezvousKey);
  }

  pump(protocol1.stream, protocol2.stream, protocol1.stream, (err) => { err && done(err); });

  await waitForExpect(() => {
    const feedMap1Keys = Array.from(map1.keys()).sort();
    const feedMap2Keys = Array.from(map1.keys()).sort();

    expect(feedMap1Keys).toEqual(feedMap2Keys);
    expect(feedMap2Keys).toHaveLength(topicKeys.length * numFeedsPerTopic);

    feedMap1Keys.forEach(key => {
      const { feed: feed1, meta: meta1 } = map1.get(key);
      const { feed: feed2, meta: meta2 } = map2.get(key);

      expect(meta1.topic).toBe(meta2.topic);
      expect(feed1.length).toBe(feed2.length);
      expect(feed2.length).toBe(numMessagesPerFeed);
    });

    done();
  });

  // TODO(ashwin): How to stop replication for a given topic?
});

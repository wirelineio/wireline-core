//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import pump from 'pump';
import waitForExpect from 'wait-for-expect';

import { keyStr } from '../util/keys';
import { Extension, Protocol } from '../protocol';

import { createFeedStore, createKeys } from './debug/generator';

debug.enable('test,protocol');

const numFeedsPerTopic = 2;
const numMessagesPerFeed = 5;
const topicKeys = createKeys(2);

// Rendezvous key for protocol handshake.
const [ rendezvousKey ] = createKeys(1);

const getTopics = async (feedStore) => {
  return Array.from(new Set(feedStore
    .getDescriptors()
    .filter(descriptor => !!descriptor.stat.metadata.topic)
    .map(descriptor => descriptor.stat.metadata.topic)));
};

const getFeedsByTopic = async (feedStore, topic) => {
  return feedStore.loadFeeds(descriptor => {
    return descriptor.stat.metadata.topic === topic;
  });
};

const getFeed = async (feedStore, key) => {
  return feedStore.findFeed(descriptor => {
    return keyStr(descriptor.key) === key;
  });
};

// TODO(burdon): Remove test and instead test replicator object.
test('feed store replication', async (done) => {

  // Generate feedStore used by the first peer.
  const feedStore1 = await createFeedStore({ topicKeys, numFeedsPerTopic, numMessagesPerFeed });

  // Generate an empty feedStore which will be populated after replication.
  const feedStore2 = await createFeedStore();

  // Extension configuration options.
  const extension = 'keys';
  const timeout = 1000;

  // Vars used across blocks.
  let protocol1;
  let protocol2;

  const createRpcHandler = ({ feedStore }) => {
    return async (protocol, context, { type, topics }) => {
      // Check credentials.
      if (!context.user) {
        throw new Error('Not authorized');
      }

      switch (type) {
        case 'list': {
          return {
            topics: await getTopics(feedStore)
          };
        }

        case 'request': {
          const results = await Promise.all(topics.map(async (topic) => {
            const feeds = await getFeedsByTopic(feedStore, topic);
            const keys = feeds.map(feed => keyStr(feed.key)) || [];

            // Share and replicate feeds over protocol stream.
            await Promise.all(keys.map(async (key) => {
              protocol.stream.feed(key);
              const feed = await getFeed(feedStore, key);
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

  const createHandshakeHandler = (feedStore) => {
    return async (protocol) => {
      const keys = protocol.getExtension(extension);

      {
        // Ask peer for topics.
        const { response: { topics } } = await keys.send({ type: 'list' });

        // Ask peer for topic feeds and replicate.
        const { response: { topics: feedsByTopic } } = await keys.send({ type: 'request', topics });
        feedsByTopic.forEach(async ({ topic, keys }) => {
          await Promise.all(keys.map(async (key) => {
<<<<<<< HEAD
            const path = `feed/${topic}/${key}`;
            const feed = await feedStore.openFeed(path, { key: Buffer.from(key, 'hex'), valueEncoding: 'json', metadata: { topic } });
=======
            const { feed, meta } = await FeedMap.createFeed(
              ram, Buffer.from(key, 'hex'), { valueEncoding: 'json' });

            await feedMap.upsertFeed(feed, { ...meta, topic });
>>>>>>> Added handshake event into Extension. Refactor extension.

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
      .setHandshakeHandler(createHandshakeHandler(feedStore1))
      .setExtension(new Extension(extension, { timeout })
        .setMessageHandler(createRpcHandler({ topicKeys, feedStore: feedStore1 })))
      .init(rendezvousKey);
  }

  {
    protocol2 = await new Protocol()
      .setUserData({ user: 'user2' })
      .setHandshakeHandler(createHandshakeHandler(feedStore2))
      .setExtension(new Extension(extension, { timeout })
        .setMessageHandler(createRpcHandler({ topicKeys, feedStore: feedStore2 })))
      .init(rendezvousKey);
  }

  pump(protocol1.stream, protocol2.stream, protocol1.stream, (err) => { err && done(err); });

  await waitForExpect(async () => {
    const feeds1 = await feedStore1.getFeeds().sort((a, b) => keyStr(a.key) < keyStr(b.key) ? -1 : 1);
    const feeds2 = await feedStore2.getFeeds().sort((a, b) => keyStr(a.key) < keyStr(b.key) ? -1 : 1);

    expect(feeds1.length).toBe(feeds2.length);
    expect(feeds2.length).toBe(topicKeys.length * numFeedsPerTopic);

    feeds1.forEach((feed, index) => {
      expect(keyStr(feed.key)).toBe(keyStr(feeds2[index].key));
      expect(feeds2[index].length).toBe(feed.length);
      expect(feeds2[index].length).toBe(numMessagesPerFeed);
    });

    done();
  });

  // TODO(ashwin): How to stop replication for a given topic?
});

//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import network from '@wirelineio/hyperswarm-network-memory';

import { keyStr, latch } from '../util';
import { Node } from '../node';

import { createKeys, createFeedStore } from './debug/generator';
import { Megafeed } from './megafeed';

debug.enable('test,megafeed,replicator,feedmap,protocol,view,extension');

const topicKeys = createKeys(5);

const [ rendezvousKey ] = createKeys(1);

test('megafeed replicator', async (done) => {
  const numFeedsPerTopic = 2;
  const numMessagesPerFeed = 5;

  const feedStore1 = await createFeedStore({ topicKeys, numFeedsPerTopic, numMessagesPerFeed });
  const megafeed1 = new Megafeed(feedStore1);

  const feedStore2 = await createFeedStore();
  const megafeed2 = new Megafeed(feedStore2);

  const node1 = new Node(network(), megafeed1).joinSwarm(rendezvousKey);
  const node2 = new Node(network(), megafeed2).joinSwarm(rendezvousKey);

  const onUpdate = latch(topicKeys.length * numFeedsPerTopic, async () => {
    const feeds1 = await feedStore1.getFeeds().sort((a, b) => keyStr(a.key) < keyStr(b.key) ? -1 : 1);
    const feeds2 = await feedStore2.getFeeds().sort((a, b) => keyStr(a.key) < keyStr(b.key) ? -1 : 1);

    expect(feeds1.length).toBe(feeds2.length);
    expect(feeds2.length).toBe(topicKeys.length * numFeedsPerTopic);

    feeds1.forEach((feed, index) => {
      expect(keyStr(feed.key)).toBe(keyStr(feeds2[index].key));
      expect(feeds2[index].length).toBe(feed.length);
      expect(feeds2[index].length).toBe(numMessagesPerFeed);
    });

    node1.leaveSwarm();
    node2.leaveSwarm();

    done();
  });

  megafeed2.on('update', onUpdate);
});

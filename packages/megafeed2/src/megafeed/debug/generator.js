//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import ram from 'random-access-memory';
import hypertrie from 'hypertrie';
import pify from 'pify';

import { FeedStore } from '@wirelineio/feed-store';

import { keyStr, times } from '../../util';

export const createKeyPairs = (num = 1) => times(num, crypto.keyPair);

export const createKeys = (num = 1) => createKeyPairs(num).map(keyPair => keyPair.publicKey);

/**
 * Generate a feed store.
 * @param {object} options
 */
export const createFeedStore = async (options = {}) => {
  const { topicKeys=[], numFeedsPerTopic = 0, numMessagesPerFeed = 0 } = options;

  // Value encoding for feed, if we have to create them.
  const valueEncoding = options.valueEncoding || 'json';

  const db = hypertrie(ram);
  const feedStore = await FeedStore.create(db, ram, { feedOptions: { valueEncoding } });

  await Promise.all(topicKeys.map(async (topic) => {
    const feedKeyPairs = createKeyPairs(numFeedsPerTopic);
    await Promise.all(feedKeyPairs.map(async ({ publicKey, secretKey }) => {
      const path = `feed/${keyStr(topic)}/${keyStr(publicKey)}`;
      const feed = await feedStore.openFeed(path, { key: publicKey, secretKey, valueEncoding, metadata: { topic: keyStr(topic) } });
      for (let i = 0; i < numMessagesPerFeed; i++) {
        await pify(feed.append.bind(feed))({ message: i });
      }
    }));
  }));

  return feedStore;
};

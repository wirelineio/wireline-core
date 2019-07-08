//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import ram from 'random-access-memory';
import hypertrie from 'hypertrie';
import pify from 'pify';

import { FeedStore } from '@wirelineio/feed-store';

import { keyStr, times } from '../../util';

import { Megafeed } from '../megafeed';

/**
 * Generates feed data.
 * @param feedStore
 * @param options
 * @returns {Promise<any>}
 */
const generateFeedData = async (feedStore, options = {}) => {
  const { topicKeys = [], numFeedsPerTopic = 0, numMessagesPerFeed = 0, valueEncoding = 'json' } = options;

  return Promise.all(topicKeys.map(async (topic) => {
    const feedKeyPairs = createKeyPairs(numFeedsPerTopic);
    await Promise.all(feedKeyPairs.map(async ({ publicKey, secretKey }) => {
      const path = `feed/${keyStr(topic)}/${keyStr(publicKey)}`;
      const feed = await feedStore.openFeed(path, { key: publicKey, secretKey, valueEncoding, metadata: { topic: keyStr(topic) } });
      for (let i = 0; i < numMessagesPerFeed; i++) {
        await pify(feed.append.bind(feed))({ message: i });
      }
    }));
  }));
};

export const createKeyPairs = (num = 1) => times(num, crypto.keyPair);

export const createKeys = (num = 1) => createKeyPairs(num).map(keyPair => keyPair.publicKey);

/**
 * Generates a Megafeed.
 * @param {object} options
 */
export const createMegafeed = async (options = {}) => {
  const { valueEncoding = 'json' } = options;

  const mega = await Megafeed.create(ram, { valueEncoding });

  // TODO(ashwin): Don't expose feedStore, breaks encapsulation.
  const { feedStore } = mega;

  await generateFeedData(feedStore, options);

  return mega;
};

/**
 * Generate a feed store.
 * @param {object} options
 */
export const createFeedStore = async (options = {}) => {
  const { valueEncoding = 'json' } = options;

  const db = hypertrie(ram);
  const feedStore = await FeedStore.create(db, ram, { feedOptions: { valueEncoding } });

  await generateFeedData(feedStore, options);

  return feedStore;
};

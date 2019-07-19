//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import ram from 'random-access-memory';
import hypertrie from 'hypertrie';
import pify from 'pify';

import { FeedStore } from '@wirelineio/feed-store';

import { AuthProvider } from '../../credentials';
import { keyStr, times } from '../../util';

import { Megafeed } from '../megafeed';

/**
 * Generates feed data.
 * @param {FeedStore|Megafeed} feedManager
 * @param options
 * @returns {Promise<any>}
 */
const generateFeedData = async (feedManager, options = {}) => {
  const { topicKeys = [], numFeedsPerTopic = 0, numMessagesPerFeed = 0, valueEncoding = 'json' } = options;

  return Promise.all(topicKeys.map(async (topic) => {
    const feedKeyPairs = createKeyPairs(numFeedsPerTopic);
    await Promise.all(feedKeyPairs.map(async ({ publicKey, secretKey }) => {
      const path = `feed/${keyStr(topic)}/${keyStr(publicKey)}`;
      const feed = await feedManager.openFeed(path, { key: publicKey, secretKey, valueEncoding, metadata: { topic: keyStr(topic) } });
      await Promise.all([...Array(numMessagesPerFeed).keys()].map(i => {
        return pify(feed.append.bind(feed))({ message: i });
      }))
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

  const keyPair = crypto.keyPair();
  const authProvider = new AuthProvider(keyPair);

  const mega = await Megafeed.create(ram, { ...keyPair, valueEncoding, authProvider });

  await generateFeedData(mega, options);

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

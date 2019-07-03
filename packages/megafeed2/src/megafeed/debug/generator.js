//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import ram from 'random-access-memory';
import hypertrie from 'hypertrie';
import pify from 'pify';

import { keyStr, times } from '../../util';
import { Codec } from '../../protocol';

import { MessageStore } from '../store';
import { FeedMap } from '../feedmap';

export const createKeyPairs = (num = 1) => times(num, crypto.keyPair);

export const createKeys = (num = 1) => createKeyPairs(num).map(keyPair => keyPair.publicKey);

/**
 * Generate a feed map.
 * @param {object} options
 */
export const createFeedMap = async (options = {}) => {
  const { topicKeys=[], numFeedsPerTopic = 0, numMessagesPerFeed = 0 } = options;

  const db = await new MessageStore(hypertrie(ram), new Codec()).ready();
  const feedMap = new FeedMap(db, ram, { map: options.map });

  // Value encoding for feed, if we have to create them.
  const valueEncoding = options.valueEncoding || 'json';

  await Promise.all(topicKeys.map(async (topic) => {
    const feedKeyPairs = createKeyPairs(numFeedsPerTopic);
    await Promise.all(feedKeyPairs.map(async ({ publicKey, secretKey }) => {
      const { feed, meta } = await FeedMap.createFeed(ram, publicKey, { secretKey, valueEncoding });
      await feedMap.upsertFeed(feed, { ...meta, topic: keyStr(topic) });

      for (let i = 0; i < numMessagesPerFeed; i++) {
        await pify(feed.append.bind(feed))({ message: i });
      }
    }));
  }));

  return feedMap;
};

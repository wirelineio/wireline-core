//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import fs from 'fs';
import rimraf from 'rimraf';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';
import pify from 'pify';

import { keyStr } from '../util/keys';

import { Codec } from '../protocol';

import { createKeys } from './debug/generator';
import { FeedMap } from './feedmap';
import { MessageStore } from './store';

const log = debug('test');

describe('feed map', () => {

  const [ topic1 ] = createKeys(2);
  const map = new Map();

  let feedMap;

  beforeAll(() => {
    rimraf.sync('./out');
    fs.mkdirSync('./out');
  });

  test('create feed map', async () => {
    const db = await new MessageStore(hypertrie('./out/db'), new Codec()).ready();
    feedMap = new FeedMap(db, ram, { map });

    expect(feedMap).toBeDefined();

    // Zero topics.
    const feedTopics = await feedMap.getTopics();
    expect(feedTopics).toHaveLength(0);
  });

  test('upsert feed', async () => {
    const { feed } = await FeedMap.createFeed(ram);
    expect(feed.key).toBeDefined();

    await feedMap.upsertFeed(feed, { topic: topic1 });

    const feeds = await feedMap.getFeedsByTopic(topic1);
    expect(feeds).toHaveLength(1);

    log(String(feedMap));
  });

  test('load topics', async () => {
    const feedTopics = await feedMap.getTopics();
    expect(feedTopics).toEqual([ keyStr(topic1) ]);
  });

  test('load from db when cache is empty', async () => {
    {
      map.clear();
      log(String(feedMap));
    }

    {
      const feeds = await feedMap.getFeedsByTopic(topic1);
      expect(feeds).toHaveLength(1);

      const [{ feed }] = feeds;
      expect(feed.secretKey).toBeDefined();
      expect(feed.writable).toBeTruthy();

      log(String(feedMap));
    }

    {
      const feeds = await feedMap.getFeedsByTopic(topic1);
      expect(feeds).toHaveLength(1);

      log(String(feedMap));
    }
  });

  test('delete feed', async () => {
    {
      const feeds = await feedMap.getFeedsByTopic(topic1);
      expect(feeds).toHaveLength(1);

      const [{ feed, meta }] = feeds;
      await feedMap.deleteFeed(feed, meta);

      expect(map.size).toBe(0);
    }

    {
      const feeds = await feedMap.getFeedsByTopic(topic1);
      expect(feeds).toHaveLength(0);
    }
  });

  test('create feed in local directory, reload into empty cache', async () => {
    {
      const { feed, meta } = await FeedMap.createFeed('./out/feed1');
      expect(feed.key).toBeDefined();
      expect(meta.storage).toBe('./out/feed1');

      await feedMap.upsertFeed(feed, { ...meta, topic: topic1 });

      const feeds = await feedMap.getFeedsByTopic(topic1);
      expect(feeds).toHaveLength(1);

      pify(feed.close.bind(feed))();
    }

    {
      map.clear();
      log(String(feedMap));
    }

    {
      const feeds = await feedMap.getFeedsByTopic(topic1);
      expect(feeds).toHaveLength(1);
      const [{ feed, meta }] = feeds;
      log(String(feedMap));

      expect(feed).toBeDefined();
      expect(meta.storage).toBe('./out/feed1');
    }

    {
      rimraf.sync('./out/feed1');
    }
  });

  test('default topic', async () => {
    {
      const { feed } = await FeedMap.createFeed(ram);
      expect(feed.key).toBeDefined();

      await feedMap.upsertFeed(feed);

      const feeds = await feedMap.getFeedsByTopic(FeedMap.DEFAULT_TOPIC);
      expect(feeds).toHaveLength(1);
    }

    {
      map.clear();
      log(String(feedMap));
    }

    {
      const feeds = await feedMap.getFeedsByTopic(FeedMap.DEFAULT_TOPIC);
      expect(feeds).toHaveLength(1);

      const [{ feed }] = feeds;
      expect(feed.secretKey).toBeDefined();
      expect(feed.writable).toBeTruthy();
    }
  });
});

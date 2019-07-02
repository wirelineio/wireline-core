//
// Copyright 2019 Wireline, Inc.
//

import bufferFrom from 'buffer-from';
import { EventEmitter } from 'events';
import hypercore from 'hypercore';
import pify from 'pify';

import { keyStr } from '../util/keys';

/**
 * Feed map (by topic).
 */
export class FeedMap extends EventEmitter {

  /**
   * Used when a topic is not provided in options to `upsertFeed`.
   * Used to support feeds that don't belong to a topic (e.g. the control feed for compatability).
   * @type {Buffer}
   */
  static DEFAULT_TOPIC = bufferFrom('0000000000000000000000000000000000000000000000000000000000000000', 'hex');

  static key(topic, key) {
    return `${keyStr(topic)}/${keyStr(key)}`;
  }

  /**
   * Feed factory.
   * @param {object} storage
   * @param {object} [key]
   * @param {object} [options]
   */
  static async createFeed(storage, key, options) {
    const feed = hypercore(storage, key, options);
    await pify(feed.ready.bind(feed))();

    return {
      feed,
      meta: {
        storage: (typeof(storage) === 'string' ? storage: null)
      }
    };
  }

  /**
   * @type {Map<{string}, {feed, meta}>}
   */
  _feedMap = new Map();

  /**
   * @constructor
   * @param {object} db - Feed index database.
   * @param {object} storage - Feed storage (for feed loading).
   * @param {object} options
   */
  constructor(db, storage, options = {}) {
    super();

    console.assert(db);
    console.assert(storage);

    // Ability to pass in a map, for tests.
    if (options.map) {
      this._feedMap = options.map;
    }

    this._db = db;
    this._storage = storage;
  }

  toString() {
    const meta = {
      size: this._feedMap.size,
    };

    return `FeedMap(${JSON.stringify(meta)})`;
  }

  get key() {
    return this._db.key;
  }

  /**
   * Get feed by key.
   * @param {object} key
   */
  getFeed(key) {
    return this._feedMap.get(keyStr(key));
  }

  /**
   * Get existing mapped feed, or create and map a new one.
   * @param {object} key
   * @param meta
   */
  async getOrCreateFeed(key, meta) {
    let { feed } = this.getFeed(key) || {};
    if (feed) {
      return feed;
    }

    let { feed: newFeed, meta: newMeta } = await FeedMap.createFeed(this._storage, key, { valueEncoding: 'json' });

    // TODO(burdon=>ashwinp): Creating feed OR updating meta -- which is it?
    await this.upsertFeed(newFeed, { ...newMeta, ...meta });

    return newFeed;
  }

  /**
   * Insert or udpate feed.
   * @param {object} feed
   * @param {object} meta
   */
  async upsertFeed(feed, meta = {}) {
    console.assert(feed);

    // TODO(burdon): Makes no sense to have optional meta.
    const topic = keyStr(meta.topic || FeedMap.DEFAULT_TOPIC);
    const value = {
      ...meta,
      key: keyStr(feed.key),
      secretKey: feed.secretKey? keyStr(feed.secretKey) : null,
      valueEncoding: feed.valueEncoding,
      topic
    };

    // TODO(burdon): Factor out key structure.
    await this._db.put(`${FeedMap.key(topic, feed.key)}`, value);
    this._feedMap.set(keyStr(feed.key), { feed, meta: value });

    this.emit('feed', { feed, meta: value });

    return this;
  }

  /**
   * Delete feed.
   * @param {object} feed
   * @param {object} meta
   */
  async deleteFeed(feed, meta = {}) {
    pify(feed.close.bind(feed))();

    // TODO(burdon): Makes no sense to have optional meta.
    const topic = keyStr(meta.topic || FeedMap.DEFAULT_TOPIC);
    await this._db.delete(`${FeedMap.key(topic, feed.key)}`);
    this._feedMap.delete(keyStr(feed.key));
  }

  /**
   * Load feeds by topic.
   * @param {object} topic
   */
  // TODO(burdon): If topic is a param here -- it needs to be in the mutation methods above.
  async getFeedsByTopic(topic) {
    console.assert(topic);

    let feeds = [];
    const dbFeeds = await this._db.list(keyStr(topic));
    await Promise.all(dbFeeds.map(async (meta) => {
      let feedData = this._feedMap.get(meta.key);
      if (!feedData) {
        // Recreate feed from meta.
        // If storage present in meta, use that, else use the storage configured for the feed map.
        const feedStorage = meta.storage || this._storage;
        const { feed } = await FeedMap.createFeed(feedStorage, meta.key, meta);
        feedData = { feed, meta };
        this._feedMap.set(meta.key, feedData);
      }

      feeds.push(feedData);
    }));

    return feeds;
  }

  /**
   * Get a list of topics.
   */
  async getTopics() {
    // TODO(ashwin): Passing { recursive: true } to hypertrie.list doesn't seem to be working, this is a workaround.
    let topics = await this._db.keys('/');
    return topics.map(key => key.split('/')[0]);
  }
}

/**
 * Multifeed adapter factory for FeedMap based on topic.
 * @param {FeedMap} feedMap
 * @param {string} topic
 * @returns {Promise<{ready, feeds: (function(): [Feed]), on}>}
 */
// TODO(burdon): Factor out.
export const createMultifeedAdapter = async (feedMap, topic) => {
  console.assert(feedMap);
  console.assert(topic);

  // TODO(ashwin): getFeedsByTopic (shouldn't know or care about loading).
  const feeds = (await feedMap.getFeedsByTopic(topic)).map(({ feed }) => feed);

  // Dispatch `feed` event to kappa.
  const onFeedListeners = new Map();
  feedMap.on('feed', ({ feed, meta }) => {
    feeds.push(feed);

    const handler = onFeedListeners.get(meta.topic);
    if (handler) {
      handler(feed);
    }
  });

  // API required by multifeed-index (https://github.com/kappa-db/multifeed-index).
  return {
    on: (event, handler) => {
      console.assert(event === 'feed');
      onFeedListeners.set(topic, handler);
    },

    ready: cb => cb(),

    // Called when kappa is initialized.
    feeds: () => feeds
  }
};

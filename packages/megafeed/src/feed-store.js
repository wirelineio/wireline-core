//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');

const debug = require('debug')('megafeed:feed-map');

const codecProtobuf = require('@wirelineio/codec-protobuf');
const {
  keyToHex,
  MessageStore,
  getDiscoveryKey
} = require('@wirelineio/utils');

const { FeedDescriptor } = require('./feed-descriptor');
const schema = require('./schema');

const codec = codecProtobuf(schema);

const STORE_NAMESPACE = 'feed';

/**
 * FeedStore
 *
 * Management of multiple feeds to create, update, load, find and delete feeds
 * into a persist repository storage.
 *
 * @extends {EventEmitter}
 */
class FeedStore extends EventEmitter {

  /**
   * constructor
   *
   * @params {HyperTrie} db
   * @param {RandomAccessStorage} storage RandomAccessStorage to use by default by the feeds.
   * @param {Object} options
   * @param {Object} options.feedOptions Default options for each feed.
   * @returns {FeedMap}
   */
  constructor(db, storage, options = {}) {
    super();

    const { feedOptions = {} } = options;

    this._messageStore = new MessageStore(
      db,
      {
        encode: message => codec.encode({ type: 'Feed', message }),
        decode: codec.decode
      }
    );

    this._defaultStorage = storage;

    this._defaultFeedOptions = feedOptions;

    this._descriptors = new Map();
  }

  /**
   * Wait for FeedMap being initialized.
   *
   * @returns {Promise}
   */
  async initialize() {
    const list = await this._messageStore.list(STORE_NAMESPACE);

    await Promise.all(
      list.map(async (data) => {
        const { path, ...stat } = data;

        this._createDescriptor(path, stat);
      })
    );
  }

  /**
   * Get the list of descriptors.
   *
   * @returns {FeedDescriptor[]}
   */
  getDescriptors() {
    return Array.from(this._descriptors.values());
  }

  getOpenedDescriptors() {
    return this.getDescriptors()
      .filter(descriptor => descriptor.opened);
  }

  /**
   * Get a descriptor by a key or the path.
   *
   * @param {Buffer|String} key
   * @returns {FeedDescriptor}
   */
  getDescriptor(key) {
    const hexKey = keyToHex(key);
    return this.getDescriptors().find(d => keyToHex(d.key) === hexKey || d.path === hexKey);
  }

  /**
   * Get the list of opened feeds.
   *
   * @returns {Hypercore[]}
   */
  feeds() {
    return this.getOpenedDescriptors()
      .map(descriptor => descriptor.feed);
  }

  find(cb) {
    const descriptor = this.getOpenedDescriptors()
      .find(descriptor => cb(descriptor));

    if (descriptor) {
      return descriptor.feed;
    }
  }

  filter(cb) {
    const descriptors = this.getOpenedDescriptors()
      .filter(descriptor => cb(descriptor));

    return descriptors.map(descriptor => descriptor.feed);
  }

  async load(cb) {
    const descriptors = this.getOpenedDescriptors()
      .filter(descriptor => cb(descriptor));

    return Promise.all(descriptors.map(descriptor => this._openFeed(descriptor)));
  }

  /**
   * Open a feed to FeedMap.
   * If the feed already exists but is not loaded it will load the feed instead of
   * create a new one.
   *
   * @param {String} path
   * @param {Object} stat
   * @param {Buffer|String} stat.key
   * @param {Buffer|String} stat.secretKey
   * @param {String} stat.valueEncoding
   * @param {Object} stat.metadata
   * @returns {Hypercore}
   */
  async open(path, stat) {
    let descriptor = this.getDescriptor(path);

    if (descriptor) {
      if (stat.key && keyToHex(stat.key) !== keyToHex(descriptor.key)) {
        throw new Error(`FeedMap: You are trying to open a feed with a different public key "${keyToHex(stat.key)}".`);
      }
    } else {
      if (stat.key && this._descriptors.get(keyToHex(getDiscoveryKey(stat.key)))) {
        throw new Error(`FeedMap: There is already a feed register with the public key "${keyToHex(stat.key)}"`);
      }

      descriptor = this._createDescriptor(path, stat);
    }

    return this._openFeed(descriptor);
  }

  async close(key) {
    const descriptor = this.getDescriptor(key);

    if (!descriptor) {
      return null;
    }

    return descriptor.close();
  }

  /**
   * Remove a feed from FeedMap.
   *
   * @param {Buffer} key
   * @returns {Promise}
   */
  async del(key) {
    const descriptor = this.getDescriptor(key);

    if (!descriptor) {
      return null;
    }

    const release = await descriptor.lock();

    try {
      await this._messageStore.delete(`${STORE_NAMESPACE}/${keyToHex(descriptor.key)}`);

      this._descriptors.delete(keyToHex(descriptor.discoveryKey));

      this.emit('feed-remove', descriptor.feed, descriptor.stat);

      await release();
    } catch (err) {
      debug(err);
      await release();
      throw err;
    }
  }

  _createDescriptor(path, stat) {
    const descriptor = new FeedDescriptor(path, stat, this._defaultStorage, this._defaultFeedOptions);
    this._descriptors.set(
      keyToHex(descriptor.discoveryKey),
      descriptor
    );
    return descriptor;
  }

  async _openFeed(descriptor) {
    // Fast return without need to lock the descriptor.
    if (descriptor.opened) {
      return descriptor.feed;
    }

    const release = await descriptor.lock();

    try {
      if (descriptor.opened) {
        await release();
        return descriptor.feed;
      }

      await this._persistFeed(descriptor);

      await descriptor.open();

      this._defineFeedEvents(descriptor);

      await release();
      return descriptor.feed;
    } catch (err) {
      debug(err);
      await release();
      throw err;
    }
  }

  async _persistFeed(descriptor) {
    const key = `${STORE_NAMESPACE}/${keyToHex(descriptor.key)}`;
    const data = await this._messageStore.get(key);

    if (!data) {
      await this._messageStore.put(key, descriptor.serialize());
    }
  }

  _defineFeedEvents(descriptor) {
    const { stat, feed } = descriptor;

    feed.on('append', () => this.emit('append', feed, stat));
    feed.on('download', (...args) => this.emit('download', ...args, feed, stat));

    process.nextTick(() => this.emit('feed', feed, stat));
  }
}

module.exports = FeedStore;

//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const assert = require('assert');

const crypto = require('hypercore-crypto');

const debug = require('debug')('megafeed:feed-map');

const Codec = require('@wirelineio/codec-protobuf');
const {
  keyToHex,
  keyToBuffer,
  MessageStore
} = require('@wirelineio/utils');

const { FeedDescriptor } = require('./feed-descriptor');
const schema = require('./schema.json');

const codec = new Codec({ verify: true });
codec.loadFromJSON(schema);

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
   * Create and initialize a new FeedStore
   *
   * @static
   * @param {HyperTrie} db
   * @param {RandomAccessStorage} storage RandomAccessStorage to use by default by the feeds.
   * @param {Object} options
   * @param {Object} options.feedOptions Default options for each feed.
   * @returns {Promise<FeedStore>}
   */
  static async create(db, storage, options = {}) {
    const feedStore = new FeedStore(db, storage, options);
    await feedStore.initialize();
    return feedStore;
  }

  /**
   * constructor
   *
   * @param {HyperTrie} db
   * @param {RandomAccessStorage} storage RandomAccessStorage to use by default by the feeds.
   * @param {Object} options
   * @param {Object} options.feedOptions Default options for each feed.
   */
  constructor(db, storage, options = {}) {
    super();

    const { feedOptions = {} } = options;

    this._messageStore = new MessageStore(
      db,
      {
        encode: (message) => {
          // Value encoding can be a codec, in which case we can't serialize it. So, change value to 'binary'.
          if (typeof (message.valueEncoding) === 'object') {
            message.valueEncoding = 'binary';
          }

          return codec.encode({ type: 'Feed', message });
        },
        decode: buffer => codec.decode(buffer, false)
      }
    );

    this._defaultStorage = storage;

    this._defaultFeedOptions = feedOptions;

    this._descriptors = new Map();

    this._ready = false;
  }

  /**
   * Initialized FeedStore reading the persisted stats and created each FeedDescriptor.
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

    process.nextTick(() => {
      this._ready = true;
      this.emit('ready');
    });
  }

  async ready() {
    if (this._ready) {
      return;
    }

    return new Promise((resolve) => {
      this.once('ready', resolve);
    });
  }

  /**
   * Get the list of descriptors.
   *
   * @returns {FeedDescriptor[]}
   */
  getDescriptors() {
    return Array.from(this._descriptors.values());
  }

  /**
   * Get the list of the opened descriptors.
   *
   * @returns {FeedDescriptor[]}
   */
  getOpenedDescriptors() {
    return this.getDescriptors()
      .filter(descriptor => descriptor.opened);
  }

  /**
   * Get a descriptor by a key.
   *
   * @param {Buffer} key
   * @returns {FeedDescriptor}
   */
  getDescriptorByKey(key) {
    return this.getDescriptors().find(descriptor => descriptor.key.equals(key));
  }

  /**
   * Get a descriptor by a path.
   *
   * @param {String} path
   * @returns {FeedDescriptor}
   */
  getDescriptorByPath(path) {
    return this.getDescriptors().find(descriptor => descriptor.path === path);
  }

  /**
   * Get the list of opened feeds.
   *
   * @returns {Hypercore[]}
   */
  getFeeds() {
    return this.getOpenedDescriptors()
      .map(descriptor => descriptor.feed);
  }

  /**
   * Find a feed using a filter callback.
   *
   * @param {FeedStore~descriptorCallback} callback
   * @returns {Hypercore}
   */
  findFeed(cb) {
    const descriptor = this.getOpenedDescriptors()
      .find(descriptor => cb(descriptor));

    if (descriptor) {
      return descriptor.feed;
    }
  }

  /**
   * Filter feeds using a filter callback.
   *
   * @param {FeedStore~descriptorCallback} callback
   * @returns {Hypercore[]}
   */
  filterFeeds(cb) {
    const descriptors = this.getOpenedDescriptors()
      .filter(descriptor => cb(descriptor));

    return descriptors.map(descriptor => descriptor.feed);
  }

  /**
   * Load feeds using a filter callback.
   *
   * @param {FeedStore~descriptorCallback} callback
   * @returns {Promise<Hypercore[]>}
   */
  async loadFeeds(cb) {
    await this.ready();

    const descriptors = this.getDescriptors()
      .filter(descriptor => cb(descriptor));

    return Promise.all(descriptors.map(descriptor => this._openFeed(descriptor)));
  }

  /**
   * Open a feed to FeedStore.
   *
   * If the feed already exists but is not loaded it will load the feed instead of
   * create a new one.
   *
   * Similar to fs.open
   *
   * @param {String} path
   * @param {Object} stat
   * @param {Buffer|String} stat.key
   * @param {Buffer|String} stat.secretKey
   * @param {String} stat.valueEncoding
   * @param {Object} stat.metadata
   * @returns {Hypercore}
   */
  async openFeed(path, stat = {}) {
    await this.ready();

    const { key } = stat;

    let descriptor = this.getDescriptorByPath(path);

    if (descriptor && key && !keyToBuffer(key).equals(descriptor.key)) {
      throw new Error(`FeedStore: You are trying to open a feed with a different public key "${keyToHex(stat.key)}".`);
    }

    if (!descriptor && key && this.getDescriptorByKey(keyToBuffer(key))) {
      throw new Error(`FeedStore: There is already a feed register with the public key "${keyToHex(stat.key)}"`);
    }

    if (!descriptor) {
      descriptor = this._createDescriptor(path, stat);
    }

    return this._openFeed(descriptor);
  }

  /**
   * Close a feed by the path.
   *
   * @param {String} path
   * @returns {Promise}
   */
  async closeFeed(path) {
    await this.ready();

    const descriptor = this.getDescriptorByPath(path);

    if (!descriptor) {
      throw new Error('Feed not found to close.');
    }

    return descriptor.close();
  }

  /**
   * Remove a feed by the path.
   *
   * @param {String} path
   * @returns {Promise}
   */
  async deleteFeed(path) {
    await this.ready();

    const descriptor = this.getDescriptorByPath(path);

    try {
      await this._messageStore.delete(`${STORE_NAMESPACE}/${keyToHex(descriptor.key)}`);

      this._descriptors.delete(keyToHex(descriptor.discoveryKey));

      this.emit('feed-remove', descriptor.feed, descriptor.stat);
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  /**
   * Factory to create a new FeedDescriptor.
   *
   * @private
   * @param path
   * @param {Object} stat
   * @param {Buffer|String} stat.key
   * @param {Buffer|String} stat.secretKey
   * @param {String} stat.valueEncoding
   * @param {Object} stat.metadata
   * @returns {FeedDescriptor}
   */
  _createDescriptor(path, stat) {
    const defaultOptions = this._defaultFeedOptions;

    let { key, secretKey, metadata } = stat;

    assert(!secretKey || (secretKey && key), 'You cannot have a secretKey without a publicKey.');

    if (!key) {
      ({ publicKey: key, secretKey } = crypto.keyPair());
    }

    metadata = Buffer.isBuffer(metadata) ? JSON.parse(metadata) : metadata;

    const descriptor = new FeedDescriptor({
      path,
      key: keyToBuffer(key),
      secretKey: keyToBuffer(secretKey),
      valueEncoding: stat.valueEncoding || defaultOptions.valueEncoding,
      metadata: Object.assign({}, defaultOptions.metadata || {}, metadata)
    }, this._defaultStorage);

    this._descriptors.set(
      keyToHex(descriptor.discoveryKey),
      descriptor
    );

    return descriptor;
  }

  /**
   * Atomic operation to open or create a feed referenced by the FeedDescriptor.
   *
   * @private
   * @param {FeedDescriptor} descriptor
   * @returns {Promise<Hypercore>}
   */
  async _openFeed(descriptor) {
    // Fast return without need to lock the descriptor.
    if (descriptor.opened) {
      return descriptor.feed;
    }

    try {
      await descriptor.open();

      await this._persistFeed(descriptor);

      this._defineFeedEvents(descriptor);

      return descriptor.feed;
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  /**
   * Persist in the db the stats of a FeedDescriptor.
   *
   * @private
   * @param {FeedDescriptor} descriptor
   * @returns {Promise}
   */
  async _persistFeed(descriptor) {
    const key = `${STORE_NAMESPACE}/${keyToHex(descriptor.key)}`;
    const data = await this._messageStore.get(key);

    if (!data) {
      await this._messageStore.put(key, descriptor.serialize());
    }
  }

  /**
   * Bubblings events from each feed to FeedStore.
   *
   * @private
   * @param {FeedDescriptor} descriptor
   * @returns {undefined}
   */
  _defineFeedEvents(descriptor) {
    const { stat, feed } = descriptor;

    feed.on('append', () => this.emit('append', feed, stat));
    feed.on('download', (...args) => this.emit('download', ...args, feed, stat));

    process.nextTick(() => this.emit('feed', feed, stat));
  }
}

/**
 * Callback to filter and/or find descriptors.
 *
 * @callback FeedStore~descriptorCallback
 * @param {number} responseCode
 * @param {string} responseMessage
 */

module.exports = FeedStore;

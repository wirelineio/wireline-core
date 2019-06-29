//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const path = require('path');

const hypercore = require('hypercore');
const raf = require('random-access-file');
const crypto = require('hypercore-crypto');
const pify = require('pify');

const codecProtobuf = require('@wirelineio/codec-protobuf');
const {
  keyToHex,
  getDiscoveryKey,
  keyToBuffer,
  Locker,
  filterFeedByPattern,
  Repository,
  Logalytics
} = require('@wirelineio/utils');

const schema = require('./schema.js');

const codec = codecProtobuf(schema);
const logalytics = Logalytics.get('megafeed:feed-map');

/**
 * FeedMap
 *
 * Management of multiple feeds to create, update, load, find and delete feeds
 * into a persist repository storage.
 *
 * @extends {EventEmitter}
 */
class FeedMap extends EventEmitter {

  /**
   * Create the properly format object message to encode and persist in the
   * repository.
   *
   * @static
   * @param {Hypercore} feed
   * @param {Object} opts
   * @returns {Object}
   */
  static formatToRepository(feed, opts) {
    return {
      name: feed.name,
      key: keyToBuffer(opts.key || feed.key),
      secretKey: keyToBuffer(opts.secretKey || feed.secretKey),
      // should be loaded during the initialization
      load: opts.load,
      // should be persisted in the repository
      persist: opts.persist,
      // hypercore opts derivated
      valueEncoding: opts.valueEncoding,
      // type of constructor for that feed
      type: opts.type
    };
  }

  /**
   * Check if a feed is open (loaded and with the storage open).
   *
   * @static
   * @param {Hypercore} feed
   * @returns {Boolean}
   */
  static isOpen(feed) {
    return feed.loaded && !feed.closed;
  }

  // TODO: remove, find another way.
  static addNewFeedMethods(feed) {
    const newFeed = feed;

    // Promise APY p*
    ['ready', 'append', 'close', 'get', 'head'].forEach((prop) => {
      if (feed[prop]) {
        newFeed[`p${prop[0].toUpperCase() + prop.slice(1)}`] = pify(feed[prop].bind(feed));
      }
    });

    return newFeed;
  }

  /**
   * constructor
   *
   * @param {RandomAccessStorage} storage RandomAccessStorage to use by default by the feeds.
   * @param {Repository} repository Repository to persist the feeds.
   * @param {Object} options
   * @param {Object} options.types Types of constructor to create custom feeds.
   * @param {Object} options.feedOptions Default options for each feed.
   * @returns {FeedMap}
   */
  constructor(db, storage, options = {}) {
    super();

    const { types = {}, feedOptions = {} } = options;

    this._repository = new Repository(
      db,
      'feeds',
      {
        encode: message => codec.encode({ type: 'Feed', message }),
        decode: codec.decode
      }
    );

    this._defaultStorage = storage;

    this._types = types;

    this._opts = feedOptions;

    this._feeds = new Map();

    this._locker = new Locker();
  }

  /**
   * Wait for FeedMap being initialized.
   *
   * @returns {Promise}
   */
  async initialize() {
    const feeds = await this._repository.list({ codec });

    await Promise.all(
      feeds.map((opts) => {
        if (opts.load) {
          return this.addFeed(opts);
        }

        if (opts.key) {
          const unloadedFeed = Object.assign({}, opts, { loaded: false });
          this._feeds.set(
            keyToHex(getDiscoveryKey(opts.key)),
            unloadedFeed
          );
        }

        return null;
      })
    );
  }

  /**
   * Get a feed by the discoveryKey.
   *
   * @param {String|Buffer} key
   * @param {Boolean} all Include unloaded feeds.
   * @returns {Hypercore|null}
   */
  feedByDK(key, all = false) {
    const hexKey = keyToHex(key);

    const feed = this._feeds.get(hexKey);

    if (feed && !all && feed.loaded) {
      return feed;
    }

    return null;
  }

  /**
   * Get a feed by the discoveryKey, name or feed key.
   *
   * @param {String|Buffer} key
   * @param {Boolean} all Include unloaded feeds.
   * @returns {Hypercore|null}
   */
  feed(key, all = false) {
    const hexKey = keyToHex(key);

    const feed = this.feedByDK(hexKey, all);

    if (feed) {
      return feed;
    }

    return this.feeds(all).find(
      f => f.name === hexKey || (f.key && keyToHex(f.key) === hexKey),
    );
  }

  /**
   * Get the list of feeds.
   *
   * @param {Boolean} all Include unloaded feeds.
   * @returns {Hypercore[]}
   */
  feeds(all = false) {
    const feeds = Array.from(this._feeds.values());

    if (all) {
      return feeds;
    }

    return feeds.filter(f => f.loaded);
  }

  /**
   * Add a new feed to FeedMap.
   * If the feed already exists but is not loaded it will load the feed instead of
   * create a new one.
   *
   * @param {Object} args
   * @param {String} args.name
   * @param {RandomAccessStorage} args.storage
   * @param {Buffer|String} args.key
   * @returns {Hypercore}
   */
  async addFeed(args = {}) {
    const {
      name = null, storage = null, key = null, ...userOpts
    } = args;

    const opts = userOpts;
    let feedName = name;
    let hexKey = key && keyToHex(key);

    if (!feedName) {
      if (!hexKey) {
        const { publicKey, secretKey } = crypto.keyPair();
        hexKey = keyToHex(publicKey);
        feedName = hexKey;
        opts.secretKey = secretKey;
      }
      feedName = hexKey;
    }

    const feed = this.feeds(true).find((f) => {
      if (hexKey && f.key && keyToHex(f.key) === hexKey) {
        return true;
      }

      return (f.name === feedName);
    });

    if (feed) {
      if (FeedMap.isOpen(feed)) {
        return feed;
      }

      const result = await this.loadFeeds([feed.name, keyToHex(feed.key)]);
      return result[0];
    }

    return this._openFeed(feedName, storage, key, opts);
  }

  /**
   * Remove a feed from FeedMap.
   *
   * @param {Buffer|String} key
   * @returns {Promise}
   */
  async deleteFeed(key) {
    const repository = this._repository;

    const feed = this.feed(key);

    if (!feed) {
      return null;
    }

    const release = await this._locker.pLock(feed.name);

    try {
      await repository.delete(feed.name);
      this._feeds.delete(keyToHex(getDiscoveryKey(feed.key)));

      this.emit('feed-remove', feed);

      await release();
    } catch (err) {
      logalytics.error(err);
      await release();
      throw err;
    }
  }

  /**
   * Update a feed by a callback transform.
   *
   * @param {Buffer|String} key
   * @param {Function} transform
   * @returns {Promise}
   */
  async updateFeed(key, transform) {
    const repository = this._repository;

    try {
      const feed = await repository.get(key, { codec });

      if (!feed) {
        return null;
      }

      const update = transform(feed.value);

      await repository.put(feed.name, update, { encode: FeedMap.encodeFeed });
    } catch (err) {
      logalytics.error(err);
      throw err;
    }
  }

  /**
   * Load feeds by a pattern.
   *
   * @param {String|String[]} pattern
   * @param {Object} options
   * @returns {Hypercore[]}
   */
  async loadFeeds(userPattern, options = {}) {
    let pattern = userPattern;

    if (Array.isArray(pattern)) {
      pattern = pattern.filter(Boolean).map(value => keyToHex(value));
    } else {
      pattern = keyToHex(pattern);
    }

    const feeds = Array.from(this._feeds.values()).filter(feed => filterFeedByPattern(feed, pattern));

    try {
      return Promise.all(
        feeds.map((feed) => {
          if (feed.loaded) {
            return feed;
          }

          const opts = Object.assign({}, feed, options);
          return this._openFeed(feed.name, opts.storage, feed.key, opts);
        }),
      );
    } catch (err) {
      logalytics.error(err);
      throw err;
    }
  }

  async persistFeed(feed, options = {}) {
    const repository = this._repository;

    const discoveryKey = keyToHex(feed.discoveryKey);

    const opts = Object.assign({}, options, { persist: true });

    try {
      const formatFeed = FeedMap.formatToRepository(feed, opts);
      await repository.put(formatFeed.name, formatFeed, { encode: FeedMap.encodeFeed });
      this._feeds.set(discoveryKey, feed);
      return feed;
    } catch (err) {
      logalytics.error(err);
      throw err;
    }
  }

  async closeFeed(key) {
    const feed = this.feed(key);

    if (!feed) {
      return null;
    }

    if (FeedMap.isOpen(feed)) {
      return feed.pClose();
    }

    return null;
  }

  announce(feed) {
    if (feed.announced) {
      return;
    }

    this.emit('feed-add', feed);
    this.emit('feed', feed); // kappa support

    /* eslint-disable */
    delete feed.silent;
    feed.announced = true;
    /* eslint-enable */
  }

  _storage(dir, customStorage) {
    const ras = customStorage || this._defaultStorage;

    return (name) => {
      if (typeof ras === 'string') {
        return raf(path.join(ras, dir, name));
      }
      return ras(`${dir}/${name}`);
    };
  }

  async _openFeed(name, storage, key, options) {
    const opts = Object.assign({}, this._opts, options);

    if (opts.persist === undefined) {
      // by default persist the feed
      opts.persist = true;
    }

    const release = await this._locker.pLock(name);

    let feed = this.feed(name);
    if (feed) {
      return feed;
    }

    try {
      const createFeed = this._types[opts.type] || hypercore;

      feed = createFeed(this._storage(name, storage), key, {
        secretKey: opts.secretKey,
        valueEncoding: opts.valueEncoding,
      });

      feed = FeedMap.addNewFeedMethods(feed);

      feed.setMaxListeners(256);

      feed.name = name;
      feed.loaded = true;
      feed.silent = opts.silent;
      feed.announced = false;

      feed.on('append', () => this.emit('append', feed));
      feed.on('download', (...args) => this.emit('download', ...args, feed));

      await feed.pReady();

      const discoveryKey = keyToHex(feed.discoveryKey);

      await this.persistFeed(feed, opts);

      this._feeds.set(discoveryKey, feed);

      await release();

      if (!feed.silent) {
        this.announce(feed);
      }

      return feed;
    } catch (err) {
      logalytics.error(err);
      await release();
      throw err;
    }
  }
}

module.exports = FeedMap;

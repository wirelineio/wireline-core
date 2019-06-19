//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const hypercore = require('hypercore');
const crypto = require('hypercore-crypto');
const pify = require('pify');
const debug = require('debug')('feedmap');

const Protobuf = require('@wirelineio/codec-protobuf');

// TODO(burdon): Anti-pattern (Max?)
const {
  keyToHex,
  keyToBuffer,
  getDiscoveryKey,
  filterFeedByPattern,
  Locker
} = require('@wirelineio/utils');

const schema = require('./schema.js');

const codec = Protobuf(schema);

/**
 * Feedmap manages a collection of hypercores.
 */
export default class FeedMap extends EventEmitter {

  // TODO(burdon): Remove static methods.

  // TODO(burdon): Not used?
  // static get codec() {
  //   return codec;
  // }

  // TODO(burdon): ???
  static optsToRepository(feed, opts) {
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

  // TODO(burdon): ???
  static optsToHypercore(opts) {
    return {
      secretKey: opts.secretKey,
      valueEncoding: opts.valueEncoding,
    };
  }

  // TODO(burdon): Wrapper class or proto util.
  static encodeFeed(message) {
    return codec.encode({ type: 'Feed', message });
  }

  // TODO(burdon): Wrapper class.
  static isOpen(feed) {
    return feed.loaded && !feed.closed;
  }

  /**
   * @param {hypercore} feed
   * @return {hypercore}
   */
  // TODO(burdon): Create wrapper class.
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

  /*
   const db = new Database(hypertrie);
   const feedMap = new FeedMap(db);           // no caching (e.g., loaded); replace with hyperdrive? (mounting?)
   await feedMap.getFeedsForTopic('xxx');     // db.query(key = '/party/xxx').
   const mf = new MF(feedMap);
   */

  /**
   * @param {{ read, write }} storage - random-access-storage
   * @param {Repository} repository
   * @param opts
   */
  // TODO(burdon): Params not objects.
  constructor({ storage, repository, opts = {} }) {
    super();
    console.assert(storage);
    console.assert(repository);

    // TODO(burdon): This gets passed around a lot. Externalize factory.
    this._storage = storage;

    // TODO(burdon): Index (and storage) for all feed metadata.
    this._repository = repository;

    this._opts = Object.assign({}, opts, {
      // Purge the options to get default options for every feed.
      // TODO(burdon): Then don't pass them in?
      feeds: undefined,
      secretKey: undefined,
      types: undefined
    });

    /**
     * @type {Map<string, {megafeed.Feed}>} Map of protocol buffer definitions.
     */
    // TODO(burdon): Hex string of key.
    // TODO(burdon): Are these hypercores or mutant hypercore/protocol buffer hybrids?
    // TODO(burdon): Confusing to use "feed" for both proto objects and hypercores.
    this._feeds = new Map();

    /**
     * @type {Map<string, Function>} Map of hypercore constructors.
     */
    // TODO(burdon): Consider hypertries for indexes.
    this._types = opts.types || {};

    // TODO(burdon): Why?
    this._locker = new Locker();
  }

  toString() {
    const meta = {
      size: this._feeds.size
    };

    return `FeedMap(${JSON.stringify(meta)})`;
  }

  /**
   * @param initFeeds - Feeds to load or create.
   */
  // TODO(burdon): Prefer to have no initialization or special semantics.
  async initFeeds(initFeeds = []) {

    // TODO(burdon): Not required.
    const repository = this._repository;

    // TODO(burdon): Load all feeds protos?
    // TODO(burdon): Construct repository with codec rather than spec each time?
    const list = await repository.getList({ codec });
    // TODO(burdon): What does persist: false mean?
    const persistedFeeds = list.map(value => Object.assign({}, value, { persist: false }));

    const feeds = persistedFeeds
      .concat(
        initFeeds
          .map(feed => Object.assign({}, feed, { fromInit: true }))
          .filter((feed) => {
            const searchFor = [keyToHex(feed.name), keyToHex(feed.key)].filter(Boolean);
            const idx = persistedFeeds.findIndex(
              pf => searchFor.includes(keyToHex(pf.name)) || searchFor.includes(keyToHex(pf.key)),
            );
            if (idx === -1) {
              return true;
            }

            // TODO(burdon): No side effects for filter.
            persistedFeeds[idx] = Object.assign({}, persistedFeeds[idx], feed);
            return false;
          }),
      )
      .map(feed => Object.assign({}, feed, { load: feed.load === undefined ? true : feed.load }));

    // Wait for concurrent async activity.
    await Promise.all(
      feeds.map((opts) => {
        const { load, key, fromInit } = opts;

        // TODO(burdon): fromInit?
        if (load || fromInit) {
          return this.addFeed(opts);
        }

        if (key) {
          const unloadedFeed = Object.assign({}, opts, { loaded: false });
          this._feeds.set(keyToHex(getDiscoveryKey(key)), unloadedFeed);
        }

        return null;
      })
    );
  }

  //
  // API
  // TODO(burdon): Grouping methods (e.g., open, close).
  //

  // TODO(burdon): Always one?
  feedByDK(key, all = false) {
    const feed = this._feeds.get(keyToHex(key));
    if (feed && !all && feed.loaded) {
      return feed;
    }

    return null;
  }

  // TODO(burdon): getFeed (verbNoun).
  feed(key, all = false) {
    const hexKey = keyToHex(key);
    const feed = this.feedByDK(hexKey, all);
    if (feed) {
      return feed;
    }

    return this.feeds(all).find(
      f => (f.name === hexKey) || (f.key && keyToHex(f.key) === hexKey),
    );
  }

  // TODO(burdon): Implicitely returns loaded feeds.
  feeds(all = false) {
    const feeds = Array.from(this._feeds.values());
    if (all) {
      return feeds;
    }

    return feeds.filter(f => f.loaded);
  }

  /**
   *
   * @param name
   * @param [storage]
   * @param key
   * @param options
   */
  // TODO(burdon): Private.
  // TODO(burdon): Inconsistent with {} syntax.
  async openFeed(name, storage, key, options) {
    const opts = Object.assign({}, this._opts, options);

    // By default persist the feed.
    // TODO(burdon): This class shouldn't know about caching.
    if (opts.persist === undefined) {
      opts.persist = true;
    }

    // TODO(burdon): Dangerous: defeat race conditions? Externalize.
    const release = await this._locker.pLock(name);

    /*
      const feedMap = new FeedMap();

      swarm.on('connect', (key) => {
        const feed = await openFeed(name(key));
      });
     */

    try {
      // TODO(burdon): Should get existing if already exists.
      // TODO(burdon): Move into factory?
      const createFeed = this._types[opts.type] || hypercore;

      // TODO(burdon): Why pass in storage?
      let feed = createFeed(this._storage(name, storage), key, FeedMap.optsToHypercore(opts));

      // TODO(burdon): Remove.
      feed = FeedMap.addNewFeedMethods(feed);

      // TODO(burdon): Move to factory.
      feed.setMaxListeners(256);

      // TODO(burdon): Must not add properties to third-party objects (collision).
      feed.name = name;
      feed.loaded = true;
      feed.silent = opts.silent;
      feed.announced = false;

      // TODO(burdon): Leaky abstraction: kappa adapter.
      feed.on('append', () => this.emit('append', feed));
      feed.on('download', (...args) => this.emit('download', ...args, feed));

      /*
        const feedMap = new FeedMap();
        const core = kappa({ feedMapAdapter(feedMap); });
       */

      await feed.pReady();

      // TODO(burdon): Remove? Do we need transient feeds?
      if (opts.persist) {
        await this.persistFeed(feed, opts);
      }

      this._feeds.set(keyToHex(feed.discoveryKey), feed);

      await release();

      // TODO(burdon): Why silent?
      // TODO(burdon): Move to Kappa adapter.
      if (!feed.silent && !feed.announced) {
        this.emit('feed:added', feed);
        this.emit('feed', feed); // kappa support

        feed.silent = false;
        feed.announced = true;
      }

      return feed;
    } catch (err) {
      // TODO(burdon): Standardize error handling.
      debug(err);
      await release();
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

  // RB: Vetos
  // 1. babel
  // 2. f(a, b=null, c=null, opts=null)
  // 3.

  // TODO(burdon): What are userOpts?
  // TODO(burdon): Don't spread userOpts into params.
  async addFeed({ storage = null, name = null, key = null, ...userOpts } = {}) {
    // TODO(burdon): Not needed.
    const opts = userOpts;

    let hexKey = key && keyToHex(key);

    let feedName = name;
    if (!feedName) {
      if (!hexKey) {
        const { publicKey, secretKey } = crypto.keyPair();
        hexKey = keyToHex(publicKey);
        feedName = hexKey;  // TODO(burdon): Null.
        opts.secretKey = secretKey;
      }

      // TODO(burdon): Name should be optional? (Strange to have default name; name is just an index).
      // TODO(burdon): Need common "namespace" for hypertrie?
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

      // TODO(burdon): Singular method loadByName, loadByKey.
      const result = await this.loadFeeds([feed.name, keyToHex(feed.key)]);
      return result[0];
    }

    return this.openFeed(feedName, storage, key, opts);
  }

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

      this.emit('feed:deleted', feed);

      await release();

      return null;
    } catch (err) {
      // TODO(burdon): Standardize error handling?
      debug(err);
      await release();
      throw err;
    }
  }

  async updateFeed(key, transform) {
    const repository = this._repository;

    try {
      const feed = await repository.get(key, { codec });
      if (!feed) {
        return null;
      }

      const update = transform(feed.value);

      await repository.put(feed.name, update, { encode: FeedMap.encodeFeed });

      // TODO(burdon): Why? (all paths return null except error which is undefined).
      return null;
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  // TODO(burdon): Make all methods plural?
  async loadFeeds(userPattern, options = {}) {
    let pattern = userPattern;

    // TODO(burdon): Why sometimes not array?
    // TODO(burdon): Consistent use of key vs. hex (see util, which guesses).
    if (Array.isArray(pattern)) {
      pattern = pattern.filter(Boolean).map(value => keyToHex(value));
    } else {
      pattern = keyToHex(pattern);
    }

    const feeds = Array.from(this._feeds.values()).filter(feed => filterFeedByPattern(feed, pattern));

    try {
      return await Promise.all(
        feeds.map((feed) => {
          if (feed.loaded) {
            return feed;
          }

          const opts = Object.assign({}, feed, options);
          return this.openFeed(feed.name, opts.storage, feed.key, opts);
        })
      );
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  // TODO(burdon): Save?
  async persistFeed(feed, options = {}) {
    const repository = this._repository;

    const discoveryKey = keyToHex(feed.discoveryKey);

    const opts = Object.assign({}, options, { persist: true });

    try {
      const formatFeed = FeedMap.optsToRepository(feed, opts);
      await repository.put(formatFeed.name, formatFeed, { encode: FeedMap.encodeFeed });
      this._feeds.set(discoveryKey, feed);
      return feed;
    } catch (err) {
      debug(err);
      throw err;
    }
  }
}

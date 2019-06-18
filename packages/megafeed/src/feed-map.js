//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const hypercore = require('hypercore');
const crypto = require('hypercore-crypto');
const pify = require('pify');
const debug = require('debug')('megafeed:feed-map');

const codecProtobuf = require('@wirelineio/codec-protobuf');
const {
  keyToHex,
  getDiscoveryKey,
  keyToBuffer,
  Locker,
  filterFeedByPattern
} = require('@wirelineio/utils');

const schema = require('./schema.js');

const codec = codecProtobuf(schema);

class FeedMap extends EventEmitter {
  static get codec() {
    return codec;
  }

  static encodeFeed(message) {
    return codec.encode({ type: 'Feed', message });
  }

  static optsTorepository(feed, opts) {
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

  static optsToHypercore(opts) {
    return {
      secretKey: opts.secretKey,
      valueEncoding: opts.valueEncoding,
    };
  }

  static isOpen(feed) {
    return feed.loaded && !feed.closed;
  }

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

  constructor({ storage, opts = {}, repository }) {
    super();

    this._feeds = new Map();

    this._storage = storage;

    this._types = opts.types || {};

    this._opts = Object.assign({}, opts, {
      // we purge the options to get a default options for every feed
      feeds: undefined,
      secretKey: undefined,
      types: undefined
    });

    this._repository = repository;

    this._locker = new Locker();
  }

  async initFeeds(initFeeds = []) {
    const repository = this._repository;

    const persistedFeeds = (await repository.getList({ codec }))
      .map(value => Object.assign({}, value, { persist: false }));

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

            persistedFeeds[idx] = Object.assign({}, persistedFeeds[idx], feed);
            return false;
          }),
      )
      .map(feed => Object.assign({}, feed, { load: feed.load === undefined ? true : feed.load }));

    await Promise.all(
      feeds.map((opts) => {
        const { fromInit } = opts;

        if (opts.load || fromInit) {
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
      }),
    );
  }

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

  feedByDK(key, all = false) {
    const hexKey = keyToHex(key);

    const feed = this._feeds.get(hexKey);

    if (feed && !all && feed.loaded) {
      return feed;
    }

    return null;
  }

  feeds(all = false) {
    const feeds = Array.from(this._feeds.values());

    if (all) {
      return feeds;
    }

    return feeds.filter(f => f.loaded);
  }

  async openFeed(name, storage, key, options) {
    const opts = Object.assign({}, this._opts, options);

    // By default persist the feed.
    if (opts.persist === undefined) {
      opts.persist = true;
    }

    // TODO(burdon): Bug: after locking, release will STILL create a new hypercore.
    const release = await this._locker.pLock(name);

    try {
      const createFeed = this._types[opts.type] || hypercore;

      let feed = createFeed(this._storage(name, storage), key, FeedMap.optsToHypercore(opts));

      feed = FeedMap.addNewFeedMethods(feed);

      feed.setMaxListeners(Infinity);

      feed.name = name;
      feed.loaded = true;
      feed.silent = opts.silent;
      feed.announced = false;

      feed.on('append', () => this.emit('append', feed));
      feed.on('download', (...args) => this.emit('download', ...args, feed));

      await feed.pReady();

      const discoveryKey = keyToHex(feed.discoveryKey);

      if (opts.persist) {
        await this.persistFeed(feed, opts);
      }

      this._feeds.set(discoveryKey, feed);

      await release();

      if (!feed.silent) {
        this.announce(feed);
      }

      return feed;
    } catch (err) {
      debug(err);
      await release();
      throw err;
    }
  }

  announce(feed) {
    if (feed.announced) {
      return;
    }

    this.emit('feed:added', feed);
    this.emit('feed', feed); // kappa support

    /* eslint-disable */
    delete feed.silent;
    feed.announced = true;
    /* eslint-enable */
  }

  async addFeed({ name = null, storage = null, key = null, ...userOpts } = {}) {
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

    return this.openFeed(feedName, storage, key, opts);
  }

  async delFeed(key) {
    const repository = this._repository;

    const feed = this.feed(key);

    if (!feed) {
      return null;
    }

    const release = await this._locker.pLock(feed.name);

    try {
      await repository.delFeed(feed.key);
      this._feeds.delete(keyToHex(getDiscoveryKey(feed.key)));

      this.emit('feed:deleted', feed);

      await release();

      return null;
    } catch (err) {
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

      return null;
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  async loadFeeds(userPattern, options = {}) {
    let pattern = userPattern;

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
        }),
      );
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  async persistFeed(feed, options = {}) {
    const repository = this._repository;

    const discoveryKey = keyToHex(feed.discoveryKey);

    const opts = Object.assign({}, options, { persist: true });

    try {
      await repository.put(FeedMap.optsTorepository(feed, opts), { encode: FeedMap.encodeFeed });
      this._feeds.set(discoveryKey, feed);
      return feed;
    } catch (err) {
      debug(err);
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
}

module.exports = FeedMap;

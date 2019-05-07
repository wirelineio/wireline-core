//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const hypercore = require('hypercore');
const mm = require('micromatch');
const pify = require('pify');
const debug = require('debug')('megafeed:feed-map');

// utils
const { keyToHex, getDiscoveryKey, keyToBuffer } = require('./utils/keys');
const Locker = require('./utils/locker');

class FeedMap extends EventEmitter {
  static optsToRoot(feed, opts) {
    return {
      name: feed.name,
      key: keyToBuffer(opts.key || feed.key),
      secretKey: keyToBuffer(opts.secretKey || feed.secretKey),
      // should be loaded during the initialization
      load: opts.load,
      // should be persisted in the root
      persist: opts.persist,
      // hypercore opts derivated
      valueEncoding: opts.valueEncoding,
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

  static feedPromisify(feed) {
    const newFeed = feed;
    newFeed.pReady = pify(feed.ready.bind(feed));
    newFeed.pAppend = pify(feed.append.bind(feed));
    newFeed.pClose = pify(feed.close.bind(feed));
    return feed;
  }

  constructor({ storage, opts = {}, root }) {
    super();

    this._feeds = new Map();

    this._storage = storage;

    this._opts = Object.assign({}, opts, {
      // we purge the options to get a default options for every feed
      feeds: undefined,
      secretKey: undefined,
    });

    this._root = root;

    this._locker = new Locker();
  }

  async initFeeds(initFeeds = []) {
    const root = this._root;

    const persistedFeeds = (await root.getFeedList()).map((msg) => {
      const { value } = msg;
      value.persist = false;
      return value;
    });

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
          this._feeds.set(
            keyToHex(getDiscoveryKey(opts.key)),
            Object.assign({}, opts, { loaded: false }),
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

    if (opts.persist === undefined) {
      // by default persist the feed
      opts.persist = true;
    }

    const release = await this._locker.pLock(name);

    try {
      let feed = hypercore(this._storage(name, storage), key, FeedMap.optsToHypercore(opts));

      feed = FeedMap.feedPromisify(feed);

      feed.setMaxListeners(256);

      feed.name = name;
      feed.loaded = true;

      feed.on('append', () => this.emit('append', feed));
      feed.on('download', (...args) => this.emit('download', ...args, feed));

      await feed.pReady();

      const discoveryKey = keyToHex(feed.discoveryKey);

      if (opts.persist) {
        await this.persistFeed(feed, opts);
      }

      this._feeds.set(discoveryKey, feed);

      await release();

      if (!opts.silent) {
        this.emit('feed:added', feed);
        this.emit('feed', feed); // kappa support
      }

      return feed;
    } catch (err) {
      debug(err);
      await release();
      throw err;
    }
  }

  async addFeed({
    name = null, storage = null, key = null, ...opts
  }) {
    let feedName = name;
    const hexKey = key && keyToHex(key);

    if (!feedName) {
      if (hexKey) {
        feedName = hexKey;
      } else {
        throw new Error('A feed name or public key is required to add a feed.');
      }
    }

    const feed = this.feeds(true).find((f) => {
      if (hexKey && f.key && keyToHex(f.key) === hexKey) {
        return true;
      }

      if (f.name === feedName) {
        return true;
      }

      return false;
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
    const root = this._root;

    const feed = this.feed(key);

    if (!feed) {
      return null;
    }

    const release = await this._locker.pLock(feed.name);

    try {
      await root.delFeed(feed.key);
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
    const root = this._root;

    try {
      const feed = await root.getFeed(key);

      if (!feed) {
        return null;
      }

      const update = transform(feed.value);

      await root.putFeed(update);

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

    const feeds = Array.from(this._feeds.values()).filter((f) => {
      const list = [f.name, keyToHex(f.key), keyToHex(getDiscoveryKey(f.key))].filter(Boolean);

      if (f.secretKey) {
        list.push(keyToHex(f.secretKey));
      }

      const matches = mm(list, pattern);

      return matches.length > 0;
    });

    try {
      const result = await Promise.all(
        feeds.map((feed) => {
          if (feed.loaded) {
            return feed;
          }

          const opts = Object.assign({}, feed, options);
          return this.openFeed(feed.name, opts.storage, feed.key, opts);
        }),
      );
      return result;
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  async persistFeed(feed, options = {}) {
    const root = this._root;

    const discoveryKey = keyToHex(feed.discoveryKey);

    const opts = Object.assign({}, options, { persist: true });

    try {
      await root.putFeed(FeedMap.optsToRoot(feed, opts));
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

  bindEvents(mega) {
    ['append', 'download', 'feed:added', 'feed', 'feed:deleted'].forEach((event) => {
      this.on(event, (...args) => mega.emit(event, ...args));
    });
  }
}

module.exports = FeedMap;

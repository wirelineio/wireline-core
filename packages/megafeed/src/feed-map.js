//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const hypercore = require('hypercore');
const mm = require('micromatch');
const pify = require('pify');

// utils
const { keyToHex, getDiscoveryKey, keyToBuffer } = require('./utils/keys');
const Locker = require('./utils/locker');

const debug = require('debug')('megafeed:feed-map');

class FeedMap extends EventEmitter {
  constructor({ storage, opts = {}, root }) {
    super();

    this._feeds = new Map();

    this._storage = storage;

    this._opts = Object.assign({}, opts, {
      // we purge the options to get a default options for every feed
      feeds: undefined,
      secretKey: undefined
    });

    this._root = root;

    this._locker = new Locker();
  }

  async initFeeds(feeds = []) {
    const root = this._root;

    const persistedFeeds = (await root.getFeedList()).map(msg => {
      const { value } = msg;
      value.persist = false;
      return value;
    });

    feeds = persistedFeeds
      .concat(
        feeds.filter(feed => {
          feed.fromInit = true;
          const searchFor = [keyToHex(feed.name), keyToHex(feed.key)].filter(Boolean);
          const idx = persistedFeeds.findIndex(pf => searchFor.includes(keyToHex(pf.name)) || searchFor.includes(keyToHex(pf.key)));

          if (idx === -1) {
            return true;
          }

          persistedFeeds[idx] = Object.assign({}, persistedFeeds[idx], feed);
          return false;
        })
      )
      .map(feed => {
        if (feed.load === undefined) {
          feed.load = true;
        }
        return feed;
      });

    await Promise.all(
      feeds.map(opts => {
        const { fromInit } = opts;
        delete opts.fromInit;

        if (opts.load || fromInit) {
          return this.addFeed(opts);
        }

        // could start unloaded
        opts.loaded = false;
        if (opts.key) {
          this._feeds.set(keyToHex(getDiscoveryKey(opts.key)), opts);
        }
      })
    );
  }

  feed(key, all = false) {
    key = keyToHex(key);

    const feed = this.feedByDK(key, all);

    if (feed) {
      return feed;
    }

    return this.feeds(all).find(feed => feed.name === key || (feed.key && feed.key.toString('hex') === key));
  }

  feedByDK(key, all = false) {
    key = keyToHex(key);

    const feed = this._feeds.get(key);

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

  async openFeed(name, storage, key, opts) {
    opts = Object.assign({}, this._opts, opts);

    if (opts.persist === undefined) {
      // by default persist the feed
      opts.persist = true;
    }

    const release = await this._locker.pLock(name);

    try {
      let feed = hypercore(this._storage(name, storage), key, this.optsToHypercore(opts));

      feed = this.feedPromisify(feed);

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

      this.emit('feed:added', feed);
      this.emit('feed', feed); // kappa support

      return feed;
    } catch (err) {
      debug(err);
      await release();
      throw err;
    }
  }

  async addFeed({ name = null, storage = null, key = null, ...opts }) {
    let feedName = name;
    const keyHex = key && keyToHex(key);

    if (!feedName) {
      if (keyHex) {
        feedName = keyHex;
      } else {
        throw new Error('A feed name or public key is required to add a feed.');
      }
    }

    const feed = this.feeds(true).find(feed => {
      if (keyHex && feed.key && feed.key.toString('hex') === keyHex) {
        return true;
      }

      if (feed.name === feedName) {
        return true;
      }

      return false;
    });

    if (feed) {
      if (this.isOpen(feed)) {
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

  async loadFeeds(pattern, opts = {}) {
    if (Array.isArray(pattern)) {
      pattern = pattern.filter(Boolean).map(value => keyToHex(value));
    } else {
      pattern = keyToHex(pattern);
    }

    const feeds = Array.from(this._feeds.values()).filter(f => {
      const list = [f.name, keyToHex(f.key), keyToHex(getDiscoveryKey(f.key))].filter(Boolean);

      if (f.secretKey) {
        list.push(keyToHex(f.secretKey));
      }

      const matches = mm(list, pattern);

      return matches.length > 0;
    });

    try {
      const result = await Promise.all(
        feeds.map(feed => {
          if (feed.loaded) {
            return feed;
          }

          opts = Object.assign({}, feed, opts);
          return this.openFeed(feed.name, opts.storage, feed.key, opts);
        })
      );
      return result;
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  async persistFeed(feed, opts = {}) {
    const root = this._root;

    const discoveryKey = keyToHex(feed.discoveryKey);

    opts.persist = true;

    try {
      await root.putFeed(this.optsToRoot(feed, opts));
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

    if (this.isOpen(feed)) {
      return feed.pClose();
    }

    return null;
  }

  optsToRoot(feed, opts) {
    return {
      name: feed.name,
      key: keyToBuffer(opts.key || feed.key),
      secretKey: keyToBuffer(opts.secretKey || feed.secretKey),
      // should be loaded during the initialization
      load: opts.load,
      // should be persisted in the root
      persist: opts.persist,
      // hypercore opts derivated
      valueEncoding: opts.valueEncoding
    };
  }

  optsToHypercore(opts) {
    return {
      secretKey: opts.secretKey,
      valueEncoding: opts.valueEncoding
    };
  }

  isOpen(feed) {
    return feed.loaded && !feed.closed;
  }

  feedPromisify(feed) {
    feed.pReady = pify(feed.ready.bind(feed));
    feed.pAppend = pify(feed.append.bind(feed));
    feed.pClose = pify(feed.close.bind(feed));
    return feed;
  }

  bindEvents(mega) {
    ['append', 'download', 'feed:added', 'feed', 'feed:deleted'].forEach(event => {
      this.on(event, (...args) => mega.emit(event, ...args));
    });
  }
}

module.exports = FeedMap;

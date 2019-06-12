//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');

const pify = require('pify');
const crypto = require('hypercore-crypto');
const raf = require('random-access-file');

const initializeRootFeed = require('./root');
const replicate = require('./replicate');
const FeedMap = require('./feed-map');
const PartyMap = require('./party-map');

// utils
const { callbackPromise, resolveCallback } = require('./utils/promise-help');
const { getDiscoveryKey, keyToBuffer, keyToHex } = require('./utils/keys');

class Megafeed extends EventEmitter {

  static keyPair(seed) {
    return crypto.keyPair(seed);
  }

  static discoveryKey(key) {
    return getDiscoveryKey(key);
  }

  static keyToBuffer(...args) {
    return keyToBuffer(...args);
  }

  static keyToHex(...args) {
    return keyToHex(...args);
  }

  constructor(storage, key, options) {
    super();
    assert(storage, 'A default storage is required.');

    // TODO(burdon): Comment?
    this.setMaxListeners(Infinity);

    let rootKey = key;
    let opts = options;

    if (typeof rootKey === 'string') {
      rootKey = keyToBuffer(rootKey);
    }

    if (!Buffer.isBuffer(rootKey) && !opts) {
      opts = rootKey;
      rootKey = null;
    }

    if (!opts) {
      opts = {};
    }

    const feeds = opts.feeds || [];

    this._defaultStorage = storage;

    this._storage = (dir, customStorage) => {
      const ras = customStorage || this._defaultStorage;

      return (name) => {
        if (typeof ras === 'string') {
          return raf(path.join(ras, dir, name));
        }
        return ras(`${dir}/${name}`);
      };
    };

    // we save all our personal information like the feed list in a private feed
    this._root = initializeRootFeed(this._storage('root', storage), rootKey, opts);

    // feeds manager instance
    this._feeds = new FeedMap({ storage: this._storage, opts, root: this._root });
    this._feeds.bindEvents(this);

    this._parties = new PartyMap({ root: this._root });
    this._parties.bindEvents(this);

    // everything is ready
    this._isReady = false;

    // public methods
    this.replicate = replicate.bind(this);

    this._initialize(feeds);
  }

  get id() {
    return this._root.feed.id;
  }

  get key() {
    return this._root.feed.key;
  }

  get discoveryKey() {
    return this._root.feed.discoveryKey;
  }

  get secretKey() {
    return this._root.feed.secretKey;
  }

  /** * Feeds API ** */

  feed(...args) {
    return this._feeds.feed(...args);
  }

  feedByDK(...args) {
    return this._feeds.feedByDK(...args);
  }

  feeds(...args) {
    return this._feeds.feeds(...args);
  }

  addFeed(options, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._feeds.addFeed(options), cb);
    });

    return cb.promise;
  }

  delFeed(key, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._feeds.delFeed(key), cb);
    });

    return cb.promise;
  }

  updateFeed(key, transform, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._feeds.updateFeed(key, transform), cb);
    });

    return cb.promise;
  }

  loadFeeds(pattern, options, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._feeds.loadFeeds(pattern, options), cb);
    });

    return cb.promise;
  }

  persistFeed(feed, options, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._feeds.persistFeed(feed, options), cb);
    });

    return cb.promise;
  }

  closeFeed(key, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._feeds.closeFeed(key), cb);
    });

    return cb.promise;
  }

  /** * Parties API ** */

  addPeer(...args) {
    return this._parties.addPeer(...args);
  }

  setRules(...args) {
    return this._parties.setRules(...args);
  }

  setParty(party, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._parties.setParty(party), cb);
    });

    return cb.promise;
  }

  party(...args) {
    return this._parties.party(...args);
  }

  parties() {
    return this._parties.list();
  }

  loadParties(pattern, cb = callbackPromise()) {
    this.ready(() => {
      resolveCallback(this._parties.loadParties(pattern), cb);
    });

    return cb.promise;
  }

  /** * Megafeed ** */

  ready(cb = callbackPromise()) {
    if (this._isReady) {
      return cb();
    }

    this.on('ready', cb);

    return cb.promise;
  }

  close(cb = callbackPromise()) {
    const root = this._root;

    this.ready(() => {
      const promise = Promise.all(this.feeds().map(feed => feed.pClose()))
        .then(() => root.pCloseFeed());

      resolveCallback(promise, cb);
    });

    return cb.promise;
  }

  destroy(cb = callbackPromise()) {
    this.close((closeErr) => {
      const warnings = [];

      if (closeErr) {
        warnings.push(closeErr);
      }

      const pifyDestroy = s => pify(s.destroy.bind(s))()
        .catch(destroyErr => warnings.push(destroyErr));

      const destroyStorage = (feed) => {
        const s = feed._storage;
        return Promise.all([
          pifyDestroy(s.bitfield),
          pifyDestroy(s.tree),
          pifyDestroy(s.data),
          pifyDestroy(s.key),
          pifyDestroy(s.secretKey),
          pifyDestroy(s.signatures),
        ]);
      };

      const promise = Promise.all([
        destroyStorage(this._root.feed),
        ...this.feeds(true)
          .filter(f => f.closed)
          .map(f => destroyStorage(f)),
      ]);

      resolveCallback(promise, cb);
    });

    return cb.promise;
  }

  _initialize(feeds) {
    resolveCallback(this._feeds.initFeeds(feeds), (err) => {
      if (err) {
        this.emit('ready', err);
        this.emit('error', err);
        return;
      }
      this._isReady = true;
      this.emit('ready');
    });
  }
}

// TODO(burdon): Don't export both.

module.exports = (...args) => new Megafeed(...args);

module.exports.Megafeed = Megafeed;

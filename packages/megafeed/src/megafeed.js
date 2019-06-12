//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');

const pify = require('pify');
const crypto = require('hypercore-crypto');
const raf = require('random-access-file');
const multi = require('multi-read-stream');
const eos = require('end-of-stream');
const through = require('through2');
const pump = require('pump');

const { PartyMap, Party } = require('@wirelineio/party');
const createRoot = require('./root');
const FeedMap = require('./feed-map');

// utils
const { callbackPromise } = require('./utils/promise-help');
const { getDiscoveryKey, keyToBuffer, keyToHex } = require('./utils/keys');
const { parsePartyPattern } = require('./utils/glob');

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

    // We save all our personal information like the feed list in a private feed
    this._root = createRoot(this._storage('root', storage), rootKey, opts);

    // Feeds manager instance
    this._feeds = new FeedMap({ storage: this._storage, opts, root: this._root });
    ['append', 'download', 'feed:added', 'feed', 'feed:deleted'].forEach((event) => {
      this._feeds.on(event, (...args) => this.emit(event, ...args));
    });

    // Parties manager instance
    this._parties = new PartyMap(this);
    ['party', 'peer-add', 'peer-remove'].forEach((event) => {
      this._parties.on(event, (...args) => this.emit(event, ...args));
    });

    // everything is ready
    this._isReady = false;

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

  async addFeed(options) {
    await this.ready();

    return this._feeds.addFeed(options);
  }

  async delFeed(key) {
    await this.ready();

    return this._feeds.delFeed(key);
  }

  async updateFeed(key, transform) {
    await this.ready();

    return this._feeds.updateFeed(key, transform);
  }

  async loadFeeds(pattern, options) {
    await this.ready();

    return this._feeds.loadFeeds(pattern, options);
  }

  async persistFeed(feed, options) {
    await this.ready();

    return this._feeds.persistFeed(feed, options);
  }

  async closeFeed(key) {
    await this.ready();

    return this._feeds.closeFeed(key);
  }

  announceFeed(feed) {
    this._feeds.announce(feed);
  }

  /** * Parties API ** */

  addPeer(...args) {
    return this._parties.addPeer(...args);
  }

  setRules(...args) {
    return this._parties.setRules(...args);
  }

  async addParty(party) {
    const newParty = party;

    if (!newParty.rules) {
      newParty.rules = 'megafeed:default';
    }

    await this._root.pReady();

    return this._parties.addParty(newParty);
  }

  async setParty(party) {
    // Just for compatibility with the old megafeed version.
    return this.addParty(party);
  }

  party(...args) {
    return this._parties.party(...args);
  }

  parties() {
    return this._parties.list();
  }

  async loadParties(pattern) {
    await this.ready();

    return this._parties.loadParties(pattern);
  }

  replicate(options = {}) {
    if (options.key && !this._parties.party(options.key)) {
      const party = new Party({
        key: options.key,
        rules: Object.assign({
          findFeed: ({ discoveryKey }) => this.feedByDK(discoveryKey)
        }, this._defineDefaultPartyRules())
      });

      return party.replicate(options);
    }
    // Compatibility with the old version of dsuite core (for now).
    return this._parties.replicate(options);
  }

  /** * Megafeed ** */

  ready(cb = callbackPromise()) {
    if (this._isReady) {
      return cb();
    }

    this.on('ready', cb);

    return cb.promise;
  }

  async close() {
    const root = this._root;

    await this.ready();

    await Promise.all(this.feeds().map(feed => feed.pClose()));

    await root.pClose();
  }

  async destroy() {
    const warnings = [];

    try {
      await this.close();
    } catch (err) {
      warnings.push(err);
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

    await Promise.all([
      destroyStorage(this._root.feed),
      ...this.feeds(true).filter(f => f.closed).map(f => destroyStorage(f)),
    ]);
  }

  watch(opts, cb) {
    let options = opts;
    let onMessage = cb;

    if (typeof options === 'function') {
      onMessage = options;
      options = {};
    }

    const stream = this.createReadStream(Object.assign({}, options, { live: true }));

    pump(stream, through.obj((data, _, next) => {
      try {
        const result = onMessage(data);
        if (result && result.then) {
          result
            .then(() => {
              next(null, data);
            })
            .catch((err) => {
              next(err);
            });
        } else {
          next(null, data);
        }
      } catch (err) {
        next(err);
      }
    }));

    return () => stream.destroy();
  }

  createReadStream(opts = {}) {
    const streams = [];

    let feeds = this.feeds();

    const { filter } = opts;

    if (filter) {
      feeds = feeds.filter(feed => feed.match(filter));
    }

    feeds.forEach((feed) => {
      streams.push(feed.createReadStream(opts));
    });

    const multiReader = multi.obj(streams);

    const onFeed = (feed) => {
      feed.ready(() => {
        if (filter && !feed.match(filter)) {
          return;
        }

        multiReader.add(feed.createReadStream(opts));
      });
    };

    this.on('feed', onFeed);
    eos(multiReader, () => this.removeListener('feed', onFeed));

    return multiReader;
  }

  _initialize(feeds) {
    this._parties.setRules(this._defineDefaultPartyRules());

    this._feeds.initFeeds(feeds)
      .then(() => {
        this._isReady = true;
        this.emit('ready');
      })
      .catch((err) => {
        this.emit('ready', err);
        this.emit('error', err);
      });
  }

  _defineDefaultPartyRules() {
    return {
      name: 'megafeed:default',

      handshake: async ({ peer }) => {
        const { party } = peer;

        const pattern = parsePartyPattern(party);

        const feeds = this.feeds().filter(feed => feed.match(pattern));

        await peer.introduceFeeds({
          keys: feeds.map(feed => feed.key)
        });

        feeds.forEach(feed => peer.replicate(feed));

        this.on('feed', async (feed) => {
          if (!feed.match(pattern)) {
            return;
          }

          await peer.introduceFeeds({
            keys: [feed.key]
          });
          peer.replicate(feed);
        });
      },

      onIntroduceFeeds: async ({ message, peer }) => {
        const { key: partyKey } = peer.party;
        const { keys } = message;

        return Promise.all(
          keys.map(key => this.addFeed({ name: `party-feed/${keyToHex(partyKey)}/${keyToHex(key)}`, key }))
        );
      }
    };
  }
}

module.exports = (...args) => new Megafeed(...args);
module.exports.Megafeed = Megafeed;

//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');
const { EventEmitter } = require('events');

const pump = require('pump');
const hypertrie = require('hypertrie');
const multi = require('multi-read-stream');
const eos = require('end-of-stream');
const through = require('through2');
const pify = require('pify');

const { PartyMap, Party } = require('@wirelineio/party');
const {
  callbackPromise,
  keyToHex,
  keyToBuffer,
  parsePartyPattern,
  filterFeedByPattern,
  bubblingEvents
} = require('@wirelineio/utils');

const FeedMap = require('./feed-map');

class Megafeed extends EventEmitter {
  /**
   *
   * @param {RandomAccessStorage} storage
   * @param {Buffer} key
   * @param {Object} options
   * @param {Object[]} options.feeds
   * @param {Object} options.types
   */
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

    // We save all our personal information like the feed list in a private feed
    this._db = hypertrie(storage, rootKey, { secretKey: opts.secretKey });

    // Feeds manager instance
    this._feeds = new FeedMap(this._db, storage, {
      types: opts.types,
      feedOptions: {
        valueEncoding: opts.valueEncoding
      }
    });

    // Parties manager instance
    this._parties = new PartyMap(this._db, {
      ready: () => this.ready(),
      findFeed: ({ discoveryKey }) => this.feedByDK(discoveryKey)
    });

    // Bubble events.
    bubblingEvents(this, this._feeds, ['append', 'download', 'feed-add', 'feed', 'feed-remove']);
    bubblingEvents(this, this._parties, ['party', 'peer-add', 'peer-remove']);

    // everything is ready
    this._isReady = false;

    this._initialize();
  }

  get id() {
    return this._db.id;
  }

  get key() {
    return this._db.key;
  }

  get discoveryKey() {
    return this._db.discoveryKey;
  }

  get secretKey() {
    return this._db.secretKey;
  }

  // eslint-disable-next-line
  get isMegafeed() {
    return true;
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

  async deleteFeed(key) {
    await this.ready();

    return this._feeds.deleteFeed(key);
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
    const dbFeed = this._db.feed;

    await this.ready();

    await Promise.all(this.feeds().map(feed => pify(feed.close.bind(feed))()));

    await pify(dbFeed.close.bind(dbFeed))();
  }

  async destroy() {
    const dbFeed = this._db.feed;
    const warnings = [];

    try {
      await this.close();
    } catch (err) {
      warnings.push(err);
    }

    const promisifyDestroy = s => pify(s.destroy.bind(s))()
      .catch(destroyErr => warnings.push(destroyErr));

    const destroyStorage = (feed) => {
      const s = feed._storage;
      return Promise.all([
        promisifyDestroy(s.bitfield),
        promisifyDestroy(s.tree),
        promisifyDestroy(s.data),
        promisifyDestroy(s.key),
        promisifyDestroy(s.secretKey),
        promisifyDestroy(s.signatures),
      ]);
    };

    await Promise.all([
      destroyStorage(dbFeed),
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
    }), () => {});

    return () => stream.destroy();
  }

  createReadStream(opts = {}) {
    const streams = [];

    let feeds = this.feeds();

    const { filter } = opts;

    if (filter) {
      feeds = feeds.filter(feed => filterFeedByPattern(feed, filter));
    }

    feeds.forEach((feed) => {
      streams.push(feed.createReadStream(opts));
    });

    const multiReader = multi.obj(streams);

    const onFeed = (feed) => {
      feed.ready(() => {
        if (filter && !filterFeedByPattern(feed, filter)) {
          return;
        }

        multiReader.add(feed.createReadStream(opts));
      });
    };

    this.on('feed', onFeed);
    eos(multiReader, () => this.removeListener('feed', onFeed));

    return multiReader;
  }

  _initialize() {
    this._parties.setRules(this._defineDefaultPartyRules());

    this._feeds.initialize()
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

        const feeds = this.feeds().filter(feed => filterFeedByPattern(feed, pattern));

        await peer.introduceFeeds({
          keys: feeds.map(feed => feed.key)
        });

        feeds.forEach(feed => peer.replicate(feed));

        this.on('feed', async (feed) => {
          if (!filterFeedByPattern(feed, pattern)) {
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
          keys.map(key => this.addFeed({ name: `feed/${keyToHex(partyKey)}/${keyToHex(key)}`, key }))
        );
      }
    };
  }
}

module.exports = (...args) => new Megafeed(...args);
module.exports.Megafeed = Megafeed;

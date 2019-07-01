const path = require('path');
const assert = require('assert');

const hypercore = require('hypercore');
const crypto = require('hypercore-crypto');
const raf = require('random-access-file');
const pify = require('pify');

const { keyToHex, keyToBuffer, getDiscoveryKey, Locker } = require('@wirelineio/utils');

const statSymbol = Symbol('stat');

class FeedDescriptor {
  static _parseStatArgument(path, stat = {}, options = {}) {
    let { key, secretKey, metadata } = stat;

    if (secretKey && !key) {
      throw new Error('You cannot have a secretKey for the feed without a publicKey too.');
    }

    if (!key) {
      ({ publicKey: key, secretKey } = crypto.keyPair());
    }

    metadata = Buffer.isBuffer(metadata) ? JSON.parse(metadata) : metadata;

    return {
      path,
      key: keyToBuffer(key),
      secretKey: keyToBuffer(secretKey),
      valueEncoding: stat.valueEncoding || options.valueEncoding,
      metadata: Object.assign({}, options.metadata || {}, metadata),
    };
  }

  constructor(path, stat, storage, options = {}) {
    assert(typeof path === 'string' && path.length > 0, 'FeedDescriptor: path is require.');

    this._stat = FeedDescriptor._parseStatArgument(path, stat, options);

    this._storage = storage;

    this._locker = new Locker();
  }

  get stat() {
    return this._stat;
  }

  get feed() {
    return this._feed;
  }

  get opened() {
    return this.feed && this._feed.opened;
  }

  get key() {
    return this._stat.key;
  }

  get secretKey() {
    return this._stat.secretKey;
  }

  get discoveryKey() {
    return getDiscoveryKey(this._stat.key);
  }

  get path() {
    return this._stat.path;
  }

  serialize() {
    const { path, key, secretKey, valueEncoding, metadata } = this._stat;

    return {
      path,
      key,
      secretKey,
      valueEncoding,
      metadata: Buffer.from(JSON.stringify(metadata))
    };
  }

  async open() {
    this._feed = hypercore(
      this._createStorage(keyToHex(this._stat.key)),
      this._stat.key,
      {
        secretKey: this._stat.secretKey,
        valueEncoding: this._stat.valueEncoding
      }
    );

    this._feed[statSymbol] = this._stat;

    return new Promise(resolve => this._feed.ready(resolve));
  }

  async close() {
    if (this.open) {
      return pify(this._feed.close.bind(this._feed))();
    }
  }

  async lock() {
    return this._locker.lock();
  }

  _createStorage(dir) {
    const ras = this._storage;

    return (name) => {
      if (typeof ras === 'string') {
        return raf(path.join(ras, dir, name));
      }
      return ras(`${dir}/${name}`);
    };
  }
}

function getStat(feed) {
  return feed[statSymbol];
}

module.exports = {
  FeedDescriptor,
  getStat
};

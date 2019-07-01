//
// Copyright 2019 Wireline, Inc.
//

const path = require('path');
const assert = require('assert');

const hypercore = require('hypercore');
const crypto = require('hypercore-crypto');
const raf = require('random-access-file');
const pify = require('pify');

const { keyToHex, getDiscoveryKey, Locker } = require('@wirelineio/utils');

const statSymbol = Symbol('stat');

/**
 * FeedDescriptor
 *
 * Abstract handler for an Hypercore instance.
 */
class FeedDescriptor {

  /**
   * constructor
   *
   * @param {Object} stat
   * @param {Buffer} stat.key
   * @param {Buffer} stat.secretKey
   * @param {String} stat.valueEncoding
   * @param {Object} stat.metadata
   * @param {RandomAccessStorage} storage
   */
  constructor(stat, storage) {
    assert(typeof stat.path === 'string' && stat.path.length > 0, 'FeedDescriptor: path is required.');
    assert(Buffer.isBuffer(stat.key), 'FeedDescriptor: key is required.');

    this._stat = stat;

    this._storage = storage;

    this._locker = new Locker();

    this._feed = null;
  }

  /**
   * @type {Object}
   */
  get stat() {
    return this._stat;
  }

  /**
   * @type {Hypercore|null}
   */
  get feed() {
    return this._feed;
  }

  /**
   * @type {Boolean}
   */
  get opened() {
    return this.feed && this._feed.opened;
  }

  /**
   * @type {Buffer}
   */
  get key() {
    return this._stat.key;
  }

  /**
   * @type {Buffer}
   */
  get secretKey() {
    return this._stat.secretKey;
  }

  /**
   * @type {Buffer}
   */
  get discoveryKey() {
    return getDiscoveryKey(this._stat.key);
  }

  /**
   * @type {String}
   */
  get path() {
    return this._stat.path;
  }

  /**
   * Serialize the stats need it for encoding.
   *
   * @returns {Object}
   */
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

  /**
   * Open an Hypercore feed based on the related stat.
   *
   * This is an atomic operation, FeedDescriptor makes
   * sure that the feed is not going to open again.
   *
   * @returns {Promise<Hypercore>}
   */
  async open() {
    const release = await this._locker.lock();

    if (this._feed) {
      await release();
      return this._feed;
    }

    try {
      this._feed = hypercore(
        this._createStorage(keyToHex(this._stat.key)),
        this._stat.key,
        {
          secretKey: this._stat.secretKey,
          valueEncoding: this._stat.valueEncoding
        }
      );

      this._feed[statSymbol] = this._stat;

      await pify(this._feed.ready.bind(this._feed))();

      await release();
    } catch (err) {
      await release();
      throw err;
    }
  }

  /**
   * Close the Hypercore referenced by the descriptor.
   *
   * @returns {Promise}
   */
  async close() {
    const release = await this._locker.lock();

    try {
      if (this.opened) {
        await pify(this._feed.close.bind(this._feed))();
      }

      await release();
    } catch (err) {
      await release();
      throw err;
    }
  }

  /**
   * Defines the real path where the Hypercore is going
   * to work with the RandomAccessStorage specified.
   *
   * @private
   * @param {String} dir
   * @returns {Function}
   */
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

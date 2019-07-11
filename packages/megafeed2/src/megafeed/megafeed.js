//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import hypertrie from 'hypertrie';
import pify from 'pify';
import mm from 'micromatch';

import { FeedStore } from '@wirelineio/feed-store';
import { keyToHex, getDiscoveryKey } from '@wirelineio/utils';

import { Replicator } from './replicator';

/**
 * A lightweight feed replication engine.
 */
export class Megafeed extends EventEmitter {

  /**
   * @param {RandomAccessStorage} storage
   * @param {Object} [options]
   */
  static async create(storage, options = {}) {
    return await new Megafeed(storage, options).initialize();
  }

  /**
   * @constructor
   * @param {RandomAccessStorage} storage
   * @param {Object} [options]
   */
  constructor(storage, options = {}) {
    super();
    console.assert(storage);

    // We save all our personal information like the feed list in a private feed.
    this._db = hypertrie(storage, options.key, { secretKey: options.secretKey });

    // Feeds manager instance
    this._feedStore = new FeedStore(this._db, storage, {
        feedOptions: {
          valueEncoding: options.valueEncoding
        }
      })
      .on('feed', (feed, stat) => this.emit('feed', feed, stat))

    // Manages feed replication.
    this._replicator = new Replicator(this._feedStore)
      .on('error', err => this.emit('error', err))
      .on('update', topic => this.emit('update', topic));
  }

  get id() {
    return this._db.id;
  }

  get key() {
    return this._db.key;
  }

  get secretKey() {
    return this._db.secretKey;
  }

  toString() {
    const meta = {};

    return `Megafeed(${JSON.stringify(meta)})`;
  }

  getFeedByPath(path) {
    return this._feedStore.findFeed(descriptor => descriptor.path === path);
  }

  getFeedByDK(key) {
    console.assert(Buffer.isBuffer(key), 'Key should be a Buffer instance.');

    return this._feedStore.findFeed(descriptor => descriptor.discoveryKey.equals(key));
  }

  async addFeed(path, stat) {
    return this._feedStore.openFeed(path, stat);
  }

  async loadFeeds(pattern) {
    if (Array.isArray(pattern)) {
      pattern = pattern.filter(Boolean).map(value => keyToHex(value));
    } else {
      pattern = keyToHex(pattern);
    }

    return this._feedStore.loadFeeds(descriptor => {
      const list = [
        descriptor.path,
        keyToHex(descriptor.key),
        keyToHex(getDiscoveryKey(descriptor.key))
      ].filter(Boolean);

      if (descriptor.secretKey) {
        list.push(keyToHex(descriptor.secretKey));
      }

      const matches = mm(list, pattern);

      return matches.length > 0
    });
  }

  /**
   * Creates a set of extensions for a new protocol stream.
   */
  createExtensions() {
    return [
      this._replicator.createExtension()
    ];
  }

  async initialize() {
    await this._feedStore.initialize();
    return this;
  }

  async destroy() {
    const warnings = [];

    try {
      await this.close();
    } catch (err) {
      warnings.push(err);
    }

    const promisifyDestroy = storage => pify(storage.destroy.bind(storage))()
      .catch(err => warnings.push(err));

    const destroyStorage = (feed) => {
      const storage = feed._storage;
      return Promise.all([
        promisifyDestroy(storage.bitfield),
        promisifyDestroy(storage.tree),
        promisifyDestroy(storage.data),
        promisifyDestroy(storage.key),
        promisifyDestroy(storage.secretKey),
        promisifyDestroy(storage.signatures),
      ]);
    };

    await Promise.all([
      destroyStorage(this._db.feed),
      ...this._feedStore.getFeeds().map(feed => destroyStorage(feed)),
    ]);
  }
}

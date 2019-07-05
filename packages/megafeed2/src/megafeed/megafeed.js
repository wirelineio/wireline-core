//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import hypertrie from 'hypertrie';

import { FeedStore } from '@wirelineio/feed-store';

import { Replicator } from './replicator';

/**
 * A lightweight feed replication engine.
 */
export class Megafeed extends EventEmitter {

  /**
   * Megafeed factory.
   * @param {RandomAccessStorage} storage
   * @param {Object} [options]
   * @returns {Promise<Megafeed>}
   */
  static async create(storage, options = {}) {
    console.assert(storage);

    const db = hypertrie(storage);
    const feedStore = await FeedStore.create(db, storage, {
      feedOptions: {
        valueEncoding: options.valueEncoding
      }
    });

    return new Megafeed(feedStore, options);
  }

  /**
   * @constructor
   * @param {FeedStore} feedStore
   * @param {Object} options
   */
  constructor(feedStore, options = {}) {
    super();
    console.assert(feedStore);

    this._options = Object.assign({
      // TODO(burdon): Evolve replication rules.
      replicate: true
    }, options);

    // Feed storage.
    this._feedStore = feedStore;

    // Manages feed replication.
    this._replicator = new Replicator(this._feedStore)
      .on('error', err => this.emit(err))
      .on('update', topic => this.emit('update', topic));
  }

  toString() {
    const meta = {};

    return `Megafeed(${JSON.stringify(meta)})`;
  }

  /**
   * Creates a set of extensions for a new protocol stream.
   */
  createExtensions() {
    return [
      this._replicator.createExtension()
    ];
  }

  /**
   * Called on the initial protocol handshake.
   */
  async onHandshake(protocol) {
    if (this._options.replicate) {
      const topics = await this._replicator.getTopics(protocol);

      // TODO(burdon): Potentially filter topics?
      await this._replicator.replicateTopics(protocol, topics);
    }
  }
}

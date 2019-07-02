//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import hypertrie from 'hypertrie';
import ram from 'random-access-memory';

import { Codec } from '../protocol';

import { FeedMap } from './feedmap';
import { Replicator } from './replicator';
import { MessageStore } from './store';

/**
 * A lightweight feed replication engine.
 */
export class Megafeed extends EventEmitter {

  /**
   * Async default constructor.
   * @param {Object} options
   * @returns {Promise<Megafeed>}
   */
  static async create(options) {
    const db = await new MessageStore(hypertrie(ram), new Codec()).ready();
    const feedMap = new FeedMap(db, ram);

    return new Megafeed(feedMap, options);
  }

  /**
   * @param {FeedMap} feedMap
   * @param {Object} options
   */
  constructor(feedMap, options = {}) {
    super();
    console.assert(feedMap);

    this._options = Object.assign({
      // TODO(burdon): Evolve replication rules.
      replicate: true
    }, options);

    // Feed storage.
    this._feedMap = feedMap;

    // Manages feed replication.
    this._replicator = new Replicator(this._feedMap)
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

//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

/**
 * Multifeed adapter factory for Megafeed based on topic.
 * @param {Megafeed} megafeed
 * @param {string} topic
 * @returns {Promise<{ready, feeds: (function(): [Feed]), on}>}
 */
export class MultifeedAdapter extends EventEmitter {

  constructor(megafeed, topic) {
    super();
    console.assert(megafeed);
    console.assert(topic);

    // TODO(burdon): Why?
    this.setMaxListeners(256);

    this._megafeed = megafeed;
    this._topic = topic;

    this._megafeed.on('feed', (feed, descriptor) => {
      if (descriptor.metadata.topic === this._topic) {
        this.emit('feed', feed);
      }
    });

    this._ready = false;

    // TODO(burdon): Move to external call.
    this.initialize();
  }

  async initialize() {
    try {
      await this._megafeed.loadFeeds((descriptor) => {
        return descriptor.metadata.topic === this._topic;
      });

      process.nextTick(() => {
        this._ready = true;
        this.emit('ready');
      });
    } catch (err) {
      process.nextTick(() => this.emit('error', err));
    }

    return this;
  }

  async destroy() {
    return this._megafeed.destroy();
  }

  feeds() {
    return this._megafeed.filterFeeds(descriptor => descriptor.metadata.topic === this._topic);
  }

  ready(cb) {
    if (this._ready) {
      return process.nextTick(() => cb());
    }

    this.once('ready', cb);
  }
}

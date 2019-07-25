//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

import { Extension } from '@wirelineio/protocol';
import { keyToHex } from '@wirelineio/utils';


/**
 * Manages key exchange and feed replication.
 */
export class Replicator extends EventEmitter {

  static extension = 'replicator';

  /**
   * @param {FeedStore} feedStore
   * @param {Object} [options]
   * @param {Number} [options.timeout]
   */
  constructor(feedStore, options = {}) {
    super();
    console.assert(feedStore);

    this._options = Object.assign({
      timeout: 1000
    }, options);

    this._feedStore = feedStore;
  }

  toString() {
    const meta = {};

    return `Replicator(${JSON.stringify(meta)})`;
  }

  /**
   * Creates a protocol extension for key exchange.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Replicator.extension, { timeout: this._options.timeout })
      .on('error', err => this.emit(err))
      .setHandshakeHandler(this._handshakeHandler.bind(this))
      .setMessageHandler(this._messageHandler.bind(this));
  }

  /**
   * Discover topics from peer.
   * @param protocol
   * @returns {Promise<[{string}]>}
   */
  async getTopics(protocol) {
    const extension = protocol.getExtension(Replicator.extension);
    console.assert(extension);

    // Ask peer for topics.
    const { response: { topics } } = await extension.send({ type: 'get-topics' });

    return topics;
  }

  /**
   * Start replicating topics.
   *
   * @param {Protocol} protocol
   * @returns {Promise<void>}
   */
  async _handshakeHandler(protocol) {
    const extension = protocol.getExtension(Replicator.extension);
    console.assert(extension);

    const topics = await this.getTopics(protocol);

    // Ask peer for topic feeds and create the feeds if doesn't exist.
    const { response: { feedKeysByTopic } } = await extension.send({ type: 'get-keys', topics });
    await Promise.all(
      feedKeysByTopic.map(async ({ topic, keys }) => {
        await Promise.all(keys.map(async (key) => {
          const path = `feed/${topic}/${key}`;
          const keyBuffer = Buffer.from(key, 'hex');

          try {
            await this._feedStore.openFeed(path, {
              key: keyBuffer,
              metadata: { topic }
            });
          } catch (err) {
            console.error(err);
          }
        }));
      })
    );

    this._feedStore.on('feed', (feed, stat) => {
      if (topics.includes(stat.metadata.topic)) {
        this._replicate(protocol, feed);
      }
    });
  }

  /**
   * Handles key exchange requests.
   *
   * @param {Protocol} protocol
   * @param {Object} context
   * @param {Object} message
   */
  async _messageHandler(protocol, context, message) {
    // TODO(burdon): Check credentials. By topic?
    // Sould be optional not a restriction to share feeds.
    // if (!context.user) {
    // throw new ProtocolError(401);
    // }

    const { type } = message;
    switch (type) {
      //
      // Get all topics.
      //
      case 'get-topics': {
        const topics = Array.from(new Set(this._feedStore
          .getDescriptors()
          .filter(descriptor => !!descriptor.stat.metadata.topic)
          // This is the only way right now to prevent share topics that you don't want to.
          .filter(descriptor => descriptor.opened)
          .map(descriptor => descriptor.stat.metadata.topic)));

        return {
          topics
        };
      }

      //
      // Get all feed keys by topic.
      //
      case 'get-keys': {
        const { topics } = message;
        const feedKeysByTopic = await Promise.all(topics.map(async (topic) => {
          const feeds = await this._feedStore.loadFeeds((descriptor) => {
            return descriptor.stat.metadata.topic === topic;
          });

          const keys = feeds.map(feed => keyToHex(feed.key));

          // Share and replicate feeds over protocol stream.
          feeds.forEach((feed) => {
            // Start replicating.
            this._replicate(protocol, feed);
          });

          return { topic, keys };
        }));

        return {
          feedKeysByTopic
        };
      }

      //
      // Error.
      //
      default: {
        throw new Error(`Invalid type: ${type}`);
      }
    }
  }

  /**
   * Replicate a feed.
   * @param {Protocol} protocol
   * @param {string} topic
   * @param {Hypercore} feed
   * @returns {boolean} - true if `feed.replicate` was called.
   * @private
   */
  _replicate(protocol, feed) {
    const { stream } = protocol;

    if (stream.destroyed) {
      console.warn('Stream already destroyed, cannot replicate.');
      return false;
    }

    const replicateOptions = Object.assign({}, protocol.streamOptions, { stream });

    // TODO(ashwin): Needs comment. What is expectedFeeds used for?
    if (!replicateOptions.live && replicateOptions.expectedFeeds === undefined) {
      stream.expectedFeeds = stream.feeds.length + 1;
    }

    feed.replicate(replicateOptions);

    return true;
  }

}
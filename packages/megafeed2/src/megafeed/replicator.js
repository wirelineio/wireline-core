//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

import { keyStr } from '../util/keys';
import { Extension, ProtocolError } from '../protocol';

/**
 * Manages key exchange and feed replication.
 */
export class Replicator extends EventEmitter {

  static extension = 'replicator';

  /**
   * @param {FeedStore} feedStore
   * @param {{ timeout }} [options]
   */
  constructor(feedStore, options) {
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
      .setMessageHandler(this._extensionHandler.bind(this));
  }

  /**
   * Handles key exchange requests.
   */
  async _extensionHandler(protocol, context, message) {
    // TODO(burdon): Check credentials. By topic?
    if (!context.user) {
      throw new ProtocolError(401);
    }

    const { type } = message;
    switch (type) {
      //
      // Get all topics.
      //
      case 'get-topics': {
        const topics = Array.from(new Set(this._feedStore
          .getDescriptors()
          .filter(descriptor => !!descriptor.stat.metadata.topic)
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
          const feeds = await this._feedStore.loadFeeds(descriptor => {
            return descriptor.stat.metadata.topic === topic;
          });

          const keys = feeds.map(feed => keyStr(feed.key));

          // Share and replicate feeds over protocol stream.
          await Promise.all(feeds.map(async (feed) => {
            // Create the feed.
            protocol.stream.feed(feed.key);

            // Start replicating.
            feed.replicate({ live: true, stream: protocol.stream });
          }));

          return { topic, keys };
        }));

        return {
          feedKeysByTopic
        }
      }

      //
      // Error.
      //
      default: {
        throw new Error('Invalid type: ' + type);
      }
    }
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
   * @param protocol
   * @param topics
   * @returns {Promise<void>}
   */
  async replicateTopics(protocol, topics) {
    const extension = protocol.getExtension(Replicator.extension);
    console.assert(extension);

    // NOTE: Does not wait to complete.
    // Ask peer for topic feeds and replicate.
    const { response: { feedKeysByTopic } } = await extension.send({ type: 'get-keys', topics });
    feedKeysByTopic.forEach(async ({ topic, keys }) => {
      await Promise.all(keys.map(async (key) => {
        const path = `feed/${topic}/${key}`;
        const feed = await this._feedStore.openFeed(path, { key: Buffer.from(key, 'hex'), metadata: { topic } });

        // TODO(burdon): Test if already replicating?
        // Share and replicate feeds over protocol stream.
        protocol.stream.feed(key);

        // Start replication.
        feed.replicate({ live: true, stream: protocol.stream });

        // TODO(burdon): Only add once.
        // Propagate replication events.
        feed.on('sync', () => {
          this.emit('update', { topic, feed });
        });
      }));
    });
  }
}

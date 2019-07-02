//
// Copyright 2019 Wireline, Inc.
//

import bufferFrom from 'buffer-from';
import { EventEmitter } from 'events';

import { keyStr } from '../util/keys';

import { Extension, ProtocolError } from '../protocol';

/**
 * Manages key exchange and feed replication.
 */
export class Replicator extends EventEmitter {

  static extension = 'replicator';

  /**
   * @param {FeedMap} feedMap
   * @param {{ timeout }} [options]
   */
  constructor(feedMap, options) {
    super();
    console.assert(feedMap);

    this._options = Object.assign({
      timeout: 1000
    }, options);

    this._feedMap = feedMap;
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

    const { type, topics } = message;
    switch (type) {
      //
      // Get all topics.
      //
      case 'get-topics': {
        return {
          topics: await this._feedMap.getTopics(context)
        };
      }

      //
      // Get all feed keys by topic.
      //
      case 'get-keys': {
        const feedKeysByTopic = await Promise.all(topics.map(async (topic) => {
          const feeds = await this._feedMap.getFeedsByTopic(topic);
          const keys = feeds.map(({ feed }) => keyStr(feed.key));

          // Share and replicate feeds over protocol stream.
          await Promise.all(feeds.map(async ({ feed }) => {
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
        const feed = await this._feedMap.getOrCreateFeed(bufferFrom(key, 'hex'), { topic });

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

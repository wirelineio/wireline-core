//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import eos from 'end-of-stream';

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
    this._peers = new Set();
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
      .setMessageHandler(this._messageHandler.bind(this))
      .setCloseHandler(this._closeHandler.bind(this));
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

    try {
      this._peers.add(protocol);

      const topics = await this.getTopics(protocol);

      const { feedKeysByTopic, feeds } = await this._getFeedsByTopic(topics);

      await extension.send({ type: 'sync-keys', feedKeysByTopic }, { oneway: true });

      feeds.forEach((feed) => {
        this._replicate(protocol, feed);
      });

      const onFeed = (feed, stat) => {
        if (topics.includes(stat.metadata.topic)) {
          const feedKeysByTopic = [{ topic: stat.metadata.topic, keys: [keyToHex(feed.key)] }];
          this._peers.forEach(async (peer) => {
            try {
              await extension.send({ type: 'sync-keys', feedKeysByTopic  }, { oneway: true });
              this._replicate(peer, feed);
            } catch (err) {
              console.warn('Replicator sync error: ', err.message);
            }
          });
        }
      };

      this._feedStore.on('feed', onFeed);

      eos(protocol.stream, () => {
        this._feedStore.removeListener('feed', onFeed);
      });
    } catch (err) {
      console.warn('Replicator handshake error: ', err.message);
      protocol.stream.destroy();
    }
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
      // The remote user wants to share keys with me.
      //
      case 'sync-keys': {
        const { feedKeysByTopic } = message;
        await this._openFeeds(feedKeysByTopic);
        break;
      }

      //
      // Error.
      //
      default: {
        throw new Error(`Invalid type: ${type}`);
      }
    }
  }

  _closeHandler(err, protocol) {
    this._peers.delete(protocol);
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

  async _getFeedsByTopic(topics) {
    const list = [];
    const feedKeysByTopic = await Promise.all(topics.map(async (topic) => {
      const feeds = await this._feedStore.loadFeeds((descriptor) => {
        return descriptor.stat.metadata.topic === topic;
      });

      const keys = feeds.map((feed) => {
        list.push(feed);
        return keyToHex(feed.key);
      });


      return { topic, keys };
    }));

    return { feedKeysByTopic, feeds: list };
  }

  async _openFeeds(feedKeysByTopic) {
    return Promise.all(
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
            // eslint-disable-next-line no-empty
          }
        }));
      })
    );
  }
}

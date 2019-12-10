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
  constructor(feedStore, party, options = {}) {
    super();
    console.assert(feedStore);
    console.assert(party);

    this._options = Object.assign({
      timeout: 1000
    }, options);

    this._feedStore = feedStore;
    this._peers = new Map();
    this._party = party;

    this._party.on('admit:feed', async () => {
      await this._replicateAll();
    });
  }

  _addPeer(protocol) {
    const { peerId } = protocol && protocol.getContext() ? protocol.getContext() : {};
    if (!peerId) {
      console.warn('peerId is empty.');
      return;
    }

    if (this._peers.has(peerId)) {
      return;
    }

    this._peers.set(peerId, protocol);
    this.emit('peer:joined', peerId);
  }

  _removePeer(protocol) {
    const { peerId } = protocol && protocol.getContext ? protocol.getContext() : {};
    if (!peerId) {
      console.warn('peerId is empty.');
      return;
    }

    this._peers.delete(peerId);
    this.emit('peer:left', peerId);
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
      .setCloseHandler(this._closeHandler.bind(this));
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
      this._addPeer(protocol);
      this._replicateAll(protocol);

      const onFeed = async (feed) => {
        this._replicate(protocol, feed);
      };

      this._feedStore.on('feed', onFeed);

      eos(protocol.stream, () => {
        this._removePeer(protocol);
        this._feedStore.removeListener('feed', onFeed);
      });
    } catch (err) {
      console.warn('Replicator handshake error: ', err.message);
      protocol.stream.destroy();
    }
  }

  _closeHandler(err, protocol) {
    this._removePeer(protocol);
  }

  async _replicateAll(protocol = null) {
    const { publicKey, feeds } = this._party;
    // Shouldn't the "topic" be the discoveryKey?
    const topic = keyToHex(publicKey);

    for await (const feedKey of feeds) {
      let feed = await this._feedStore.findFeed(d => d.key.equals(feedKey));
      if (!feed) {
        const path = `feed/${topic}/${keyToHex(feedKey)}`;
        feed = await this._feedStore.openFeed(path, {
          key: feedKey,
          metadata: { topic }
        });
      }

      if (protocol) {
        this._replicate(protocol, feed);
      } else {
        for (const peer of this._peers.values()) {
          this._replicate(peer, feed);
        }
      }
    }
  }

  /**
   * Replicate a feed.
   * @param {Protocol} protocol
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

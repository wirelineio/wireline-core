//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

import { keyToHex } from '@wirelineio/utils';

import { Extension } from './extension';

/**
 * Peer chat.
 */
export class PeerChat extends EventEmitter {

  static EXTENSION_NAME = 'chat';

  // @type {Map<{string, Protocol>}
  _peers = new Map();

  /**
   * @constructor
   * @param {string} peerId
   * @param {Function} peerMessageHandler
   */
  constructor(peerId, peerMessageHandler) {
    super();

    console.assert(Buffer.isBuffer(peerId));
    console.assert(peerMessageHandler);

    this._peerId = peerId;
    this._peerMessageHandler = peerMessageHandler;
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(PeerChat.EXTENSION_NAME)
      .setMessageHandler(this._peerMessageHandler)
      .setHandshakeHandler((protocol) => {
        this._addPeer(protocol);
      })
      .setCloseHandler((err, protocol) => {
        if (err) {
          console.warn(err.message);
        }
        this._removePeer(protocol);
      });
  }

  /**
   * Broadcast message to peers.
   * @param {string} message
   * @return {Promise<void>}
   */
  async broadcastMessage(message) {
    console.assert(message);

    if (!this._peers.size) {
      this.emit('peer:not-found');
      return;
    }

    this._peers.forEach((peer) => {
      // Async broadcast, so don't (a)wait.
      this._sendPeerMessage(peer, message);
    });
  }

  /**
   * Send message to peer.
   * @param {string} peerId
   * @param {string} message
   * @return {Promise<void>}
   */
  async sendMessage(peerId, message) {
    console.assert(peerId);
    console.assert(message);

    const peer = this._peers.get(keyToHex(peerId));
    if (!peer) {
      this.emit('peer:not-found', peerId);
      return;
    }

    await this._sendPeerMessage(peer, message);
  }

  /**
   * Send message to peer.
   * @param {Protocol} peer
   * @param {string} message
   * @return {Promise<void>}
   * @private
   */
  async _sendPeerMessage(peer, message) {
    const chat = peer.getExtension(PeerChat.EXTENSION_NAME);
    await chat.send({ type: 'message', message }, { oneway: true });
  }

  /**
   * Add peer.
   * @param {Protocol} protocol
   * @private
   */
  _addPeer(protocol) {
    // TODO(ashwin): Is there a natural base class for peer management?
    console.assert(protocol);
    const { peerId } = protocol.getContext();

    if (this._peers.has(keyToHex(peerId))) {
      this.emit('peer:already-connected', peerId);
      return;
    }

    this._peers.set(keyToHex(peerId), protocol);
    this.emit('peer:joined', peerId, protocol);
  }

  /**
   * Remove peer.
   * @param {Protocol} protocol
   * @private
   */
  _removePeer(protocol) {
    console.assert(protocol);
    const { peerId } = protocol.getContext();
    this._peers.delete(keyToHex(peerId));
    this.emit('peer:left', peerId);
  }
}

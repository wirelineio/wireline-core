//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import debug from 'debug';

import { keyToHex } from '@wirelineio/utils';
import { Extension } from './extension';


const log = debug('protocol:greeter');

/**
 * An extension for "greet" nodes.  The Greeter
 * operates on party A in the open, verifying nodes'
 * invitations before they are admitted to party B,
 * which requires authentication.
 */
export class Greeter extends EventEmitter {

  static EXTENSION_NAME = 'greeter';

  constructor(peerId, peerMessageHandler, options = {}) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
    this._peers = new Map();
    this._peerMessageHandler = peerMessageHandler;
  }

  get peerId() {
    return this._peerId;
  }

  get peers() {
    return Array.from(this._peers.values());
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Greeter.EXTENSION_NAME, { binary: false })
      .setMessageHandler(this._receive.bind(this))
      .setHandshakeHandler(this._addPeer.bind(this))
      .setCloseHandler(this._removePeer.bind(this));
  }

  async send(peerId, message) {
    const peer = this._peers.get(keyToHex(peerId));
    const gext = peer.getExtension(Greeter.EXTENSION_NAME);
    return gext.send(message, { oneway: false });
  }

  async _receive(protocol, context, chunk) {
    // TODO(telackey): Codec goes here.
    const decoded = chunk;

    let response;

    if (this._peerMessageHandler) {
      response = await this._peerMessageHandler(decoded);
    } else {
      response = {
        status: 503,
        error: 'No handler'
      };
    }

    // TODO(telackey): Codec goes here.
    const encoded = response;
    return encoded;
  }

  _addPeer(protocol) {
    const { peerId } = protocol ? protocol.getContext() : {};
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
}

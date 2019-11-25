//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import debug from 'debug';

import { keyToHex } from '@wirelineio/utils';
import { Extension } from './extension';
import { ProtocolError } from './protocol';


const log = debug('protocol:greeter'); // eslint-disable-line no-unused-vars


/**
 * An extension for 'greet' nodes.  The Greeter operates on party A in the open, verifying nodes'
 * invitations before they are admitted to party B, which requires authentication.
 */
export class Greeter extends EventEmitter {

  static EXTENSION_NAME = 'greeter';

  constructor(peerId, peerMessageHandler, params = {}) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
    this._peers = new Map();
    this._peerMessageHandler = peerMessageHandler;
    this._params = params;
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
    if (!this._peerMessageHandler) {
      throw new ProtocolError(500, 'No message handler!');
    }

    const decoded = chunk; // TODO(telackey): Codec goes here.

    const response = await this._peerMessageHandler(decoded);

    const encoded = response; // TODO(telackey): Codec goes here.

    return encoded;
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
}

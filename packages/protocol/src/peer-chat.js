//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

import CodecProtobuf from '@dxos/codec-protobuf';

// TODO(burdon): Protobuf is a core module -- it must not depend on any other frameowrk modules.
import Broadcast from '@wirelineio/broadcast';
import { keyToHex, keyToBuffer } from '@wirelineio/utils';

import { Extension } from './extension';

// eslint-disable-next-line
import schema from './schema.json';

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
  constructor(peerId, peerMessageHandler = () => {}) {
    super();

    console.assert(Buffer.isBuffer(peerId));
    console.assert(peerMessageHandler);

    this._peerId = peerId;
    this._codec = new CodecProtobuf({ verify: true });
    this._codec.loadFromJSON(schema);
    this._onMessage = (protocol, context, message) => {
      try {
        this.emit('message', message);
        peerMessageHandler(protocol, context, message);
      } catch (err) {
        // do nothing
      }
    };

    this._broadcast = new Broadcast({
      id: this._peerId,
      middleware: {
        lookup: () => {
          return Array.from(this._peers.values()).map((peer) => {
            const { peerId } = peer.getContext();

            return {
              id: keyToBuffer(peerId),
              protocol: peer
            };
          });
        },
        send: (packet, peer) => {
          this._sendPeerMessage(peer.protocol, packet);
        },
        subscribe: (onPacket) => {
          this._peerMessageHandler = (protocol, context, chunk) => {
            const { type, data: message } = this._codec.decode(chunk, false);

            try {
              const packet = onPacket(message);
              if (packet) this._onMessage(protocol, context, { type, message: packet.data.toString() });
            } catch (err) {
              this._onMessage(protocol, context, { type, message: message.toString() });
            }
          };
        }
      }
    });

    this._broadcast.run();
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(PeerChat.EXTENSION_NAME, { binary: true })
      .setMessageHandler(this._peerMessageHandler)
      .setHandshakeHandler((protocol) => {
        this._addPeer(protocol);
      })
      .setCloseHandler((err, protocol) => {
        // This errors can happen all the time without been an issue.
        const protocolErrors = ['Remote timed out', 'premature close'];
        if (err && !protocolErrors.includes(err.message)) {
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

    await this._broadcast.publish(Buffer.from(message));
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

    await this._sendPeerMessage(peer, Buffer.from(message));
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
    const chunk = this._codec.encode({ type: 'protocol.PeerChatMessage', message: { type: 'message', data: message } });
    await chat.send(chunk, { oneway: true });
  }

  /**
   * Add peer.
   * @param {Protocol} protocol
   * @private
   */
  _addPeer(protocol) {
    // TODO(ashwin): Is there a natural base class for peer management?
    console.assert(protocol);
    const { peerId } = protocol ? protocol.getContext() : {};

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
    const context = protocol ? protocol.getContext() : {};
    const { peerId } = context || {};
    if (peerId) {
      this._peers.delete(keyToHex(peerId));
      this.emit('peer:left', peerId);
    }
  }
}

//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import createGraph from 'ngraph.graph';

import Broadcast from '@wirelineio/broadcast';
import CodecProtobuf from '@wirelineio/codec-protobuf';
import { keyToHex, keyToBuffer } from '@wirelineio/utils';

import { Extension } from './extension';

// eslint-disable-next-line
import schema from './schema.json';

/**
 * Presence.
 */
export class Presence extends EventEmitter {

  static EXTENSION_NAME = 'presence';

  // @type {Map<{string, Protocol>}
  _neighbors = new Map();

  /**
   * @constructor
   * @param {string} peerId
   * @param {Function} peerMessageHandler
   */
  constructor(peerId) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
    this._codec = new CodecProtobuf({ verify: true });
    this._codec.loadFromJSON(schema);

    this._broadcast = new Broadcast({
      id: this._peerId,
      lookup: () => {
        return Array.from(this._peers.values()).map((peer) => {
          const { peerId } = peer.getContext();

          return {
            id: keyToBuffer(peerId),
            protocol: peer
          };
        });
      },
      sender: (packet, peer) => {
        this._sendPeerMessage(peer.protocol, packet);
      },
      receiver: (onPacket) => {
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
    });

    this._network = createGraph();
    this._network.addNode(keyToHex(this._peerId));

    this._broadcast.run();
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Presence.EXTENSION_NAME, { binary: true })
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
   * Send message to peer.
   * @param {Protocol} peer
   * @param {Buffer} message
   * @return {Promise<void>}
   * @private
   */
  async _sendPeerMessage(peer, message) {
    const presence = peer.getExtension(Presence.EXTENSION_NAME);
    await presence.send(message, { oneway: true });
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

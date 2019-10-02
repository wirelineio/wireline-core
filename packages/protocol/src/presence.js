//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import createGraph from 'ngraph.graph';
import debug from 'debug';

import Broadcast from '@wirelineio/broadcast';
import CodecProtobuf from '@wirelineio/codec-protobuf';
import { keyToHex, keyToBuffer } from '@wirelineio/utils';

import { Extension } from './extension';

// eslint-disable-next-line
import schema from './schema.json';

const log = debug('presence');

/**
 * Presence.
 */
export class Presence extends EventEmitter {

  static EXTENSION_NAME = 'presence';

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

    this._neighbors = new Map();
    this.network = createGraph();
    this.network.addNode(keyToHex(this._peerId));

    this._broadcast = new Broadcast({
      id: this._peerId,
      lookup: () => {
        return Array.from(this._neighbors.values()).map((peer) => {
          const { peerId } = peer.getContext();

          return {
            id: keyToBuffer(peerId),
            protocol: peer
          };
        });
      },
      sender: async (packet, { protocol }) => {
        const presence = protocol.getExtension(Presence.EXTENSION_NAME);
        await presence.send(packet, { oneway: true });
      },
      receiver: (onPacket) => {
        this._peerMessageHandler = (protocol, context, chunk) => {
          onPacket(chunk);
        };
      }
    });

    this._broadcast.on('packet', (packet) => {
      this.emit('remote-ping', this._codec.decode(packet.data, false));
    });
    this.network.on('changed', (changes) => {
      this.emit('network-updated', changes, this.network);
    });

    this._broadcast.run();

    this._initializeScheduler();

    this.on('remote-ping', packet => this._updateNetwork(packet));
    this.on('network-updated', (changes) => {
      changes.forEach(({ changeType, node, link }) => {
        if (changeType === 'update') return;

        const type = changeType === 'add' ? 'joined' : 'left';

        if (node) this.emit(`peer:${type}`, keyToBuffer(node.id));
        if (link) this.emit(`connection:${type}`, keyToBuffer(link.fromId), keyToBuffer(link.toId));
      });
    });
  }

  get peerId() {
    return this._peerId;
  }

  get peers() {
    const list = [];
    this.network.forEachNode((node) => {
      list.push(keyToBuffer(node.id));
    });
    return list;
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Presence.EXTENSION_NAME, { binary: true })
      .setMessageHandler(this._peerMessageHandler)
      .setHandshakeHandler((protocol) => {
        log('handshake', protocol.getContext());
        this._addPeer(protocol);
      })
      .setCloseHandler((err, protocol) => {
        // This errors can happen all the time without been an issue.
        const protocolErrors = ['Remote timed out', 'premature close'];
        if (err && !protocolErrors.includes(err.message)) {
          console.warn(err.message);
        }
        log('close', protocol.getContext(), err && err.message);
        this._removePeer(protocol);
      });
  }

  async ping() {
    const message = {
      from: this._peerId,
      connections: Array.from(this._neighbors.values()).map((peer) => {
        const { peerId } = peer.getContext();
        return { peerId: keyToBuffer(peerId) };
      })
    };
    return this._broadcast.publish(this._codec.encode({ type: 'protocol.Presence', message }));
  }

  /**
   * Add peer.
   * @param {Protocol} protocol
   * @private
   */
  _addPeer(protocol) {
    // TODO(ashwin): Is there a natural base class for peer management?
    console.assert(protocol);
    const context = protocol.getContext();

    if (!context || !context.peerId) {
      this.emit('error', new Error('peerId not found'));
      return;
    }

    const { peerId } = context;

    if (this._neighbors.has(peerId)) {
      this.emit('neighbor:already-connected', peerId);
      return;
    }

    this._neighbors.set(peerId, protocol);
    this.network.addNode(peerId, { lastUpdate: Date.now() });
    const [source, target] = [keyToHex(this._peerId), peerId].sort();
    if (!this.network.hasLink(source, target)) {
      this.network.addLink(source, target);
    }
    this.emit('neighbor:joined', keyToBuffer(peerId), protocol);
  }

  /**
   * Remove peer.
   * @param {Protocol} protocol
   * @private
   */
  _removePeer(protocol) {
    console.assert(protocol);
    const context = protocol.getContext();
    if (!context || !context.peerId) return;

    const { peerId } = context;
    this._neighbors.delete(peerId);
    this.network.removeNode(peerId);
    this.network.forEachLinkedNode(peerId, (_, link) => {
      this.network.removeLink(link);
    });
    this.emit('neighbor:left', peerId);
  }

  _initializeScheduler() {
    this._pingInterval = setInterval(() => {
      this.ping();
    }, 2 * 1000);

    this._pruneNetworkInterval = setInterval(() => {
      const now = Date.now();
      const localPeerId = keyToHex(this._peerId);
      this.network.beginUpdate();
      this.network.forEachNode((node) => {
        if (node.id === localPeerId) return;
        if (this._neighbors.has(node.id)) return;

        if ((now - node.data.lastUpdate) > 5 * 1000) {
          this.network.removeNode(node.id);
          this.network.forEachLinkedNode(node.id, (_, link) => {
            this.network.removeLink(link);
          });
        }
      });
      this.network.endUpdate();
    }, 5 * 1000);
  }

  _updateNetwork({ from, connections = [] }) {
    const fromHex = keyToHex(from);

    const lastUpdate = Date.now();

    this.network.beginUpdate();

    this.network.addNode(fromHex, { lastUpdate });

    connections.forEach(({ peerId }) => {
      peerId = keyToHex(peerId);
      this.network.addNode(peerId, { lastUpdate });
      const [source, target] = [fromHex, peerId].sort();
      if (!this.network.hasLink(source, target)) {
        this.network.addLink(source, target);
      }
    });

    this.network.endUpdate();
  }
}
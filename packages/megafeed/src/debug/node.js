//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';
import pump from 'pump';
import crypto from 'hypercore-crypto';

import { Protocol } from '@wirelineio/protocol';
import { keyToHex, keyToHuman, getDiscoveryKey } from '@wirelineio/utils';

const log = debug('megafeed:debug:node');

/**
 * Simulation of a peer.
 */
export class Node extends EventEmitter {

  /**
   * @type {Map<{id, Protocol}>}
   */
  _peerMap = new Map();

  /**
   * @param {Network} network
   * @param {Megafeed} megafeed
   * @param {Object} options
   */
  constructor(network, megafeed, options = {}) {
    super();
    console.assert(network);

    // TODO(ashwin): Persist in database?
    this._id = options.publicKey || crypto.keyPair().publicKey;

    // TODO(burdon): Should we own this object or respond to it?
    this._network = network
      .on('error', err => this.emit(err))
      .on('connection', async (connection, details) => {
        const { id: peerId } = details;
        await this._handleConnect(connection, peerId);
      })
      .on('disconnection', async (connection, details) => {
        const { id: peerId } = details;
        await this._handleDisconnect(connection, peerId);
      });

    // Virtual shared data store.
    this._megafeed = megafeed;
  }

  toString() {
    const meta = {
      id: keyToHex(this._id),
      peers: this._peerMap.size
    };

    return `Node(${JSON.stringify(meta)})`;
  }

  get id() {
    return this._id;
  }

  /**
   * Connect to the swarm. Triggers a `connection` event.
   * @param {{ publicKey, secretKey }} rendezvousKey - Shared secret with other peer (to establish a session).
   */
  // TODO(burdon): What is the rendezvous key? Arbitrary? User? Team? Multiple?
  joinSwarm(rendezvousKey) {
    console.assert(rendezvousKey);
    console.assert(!this._rendezvousKey, 'Already connected');

    log(keyToHuman(this._id), 'joining', keyToHuman(rendezvousKey));
    this._rendezvousKey = rendezvousKey;
    this._network.join(getDiscoveryKey(this._rendezvousKey));

    return this;
  }

  /**
   * Disconnect from the swarm. Triggers a `disconnection` event.
   */
  leaveSwarm() {
    console.assert(this._rendezvousKey);

    // TODO(burdon): Error: premature close.
    log(keyToHuman(this._id), 'leaving', keyToHuman(this._rendezvousKey));

    this._network.leave(getDiscoveryKey(this._rendezvousKey));
    this._rendezvousKey = null;

    return this;
  }

  /**
   * Each protocol instance requires a set of bound extension instances.
   */
  _createExtensions() {
    return [
      ...this._megafeed.createExtensions()
    ];
  }

  async _handleConnect(stream, peerKey) {
    log(keyToHuman(this._id, 'node'), 'connected', keyToHuman(peerKey));

    // Check if we know the rendezvous key for the given discovery key.
    const discoveryToPublicKey = (discoveryKey) => {
      if (keyToHex(discoveryKey) === keyToHex(getDiscoveryKey(this._rendezvousKey))) {
        return this._rendezvousKey;
      }

      // Matching rendezvous key not found (might have changed recently).
      return  null;
    };

    // Create a new protocol stream.
    const protocol = new Protocol({
      streamOptions: {
        id: this._id,
        live: true
      },
      discoveryToPublicKey
    })
      .setUserData({ user: {} })
      .setExtensions(this._createExtensions())
      .init(getDiscoveryKey(this._rendezvousKey));

    // Connect the streams.
    pump(protocol.stream, stream, protocol.stream, (err) => {
      if (err) {
        log('Stream error:', err);
        this.emit(err);
      }
    });

    // Handle the handshake.
    protocol.once('handshake', async () => {
      this._peerMap.set(keyToHex(peerKey), protocol);
      this.emit('handshake', peerKey);
    });
  }

  async _handleDisconnect(stream, peerKey) {
    // Protocol streams will get disconnected via `pump`.
    this._peerMap.delete(keyToHex(peerKey));
    log(keyToHuman(this._id, 'node'), 'disconnected', keyToHuman(peerKey));
  }
}

//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';
import pump from 'pump';
import crypto from 'hypercore-crypto';

import { keyStr, keyName, discoveryKey } from './util/keys';
import { Protocol } from './protocol';

import { Messenger } from './messenger';

const log = debug('node');

/**
 * Manages streams between peers.
 */
export class Node extends EventEmitter {

  // TODO(burdon): Move outside of megafeed pacakge.

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

    // Enable ephemeral messages between peers.
    this._messenger = new Messenger();

    // Virtual shared data store.
    this._megafeed = megafeed;
  }

  toString() {
    const meta = {
      id: keyName(this._id),
      peers: this._peerMap.size
    };

    return `Node(${JSON.stringify(meta)})`;
  }

  get id() {
    return this._id;
  }

  /**
   * Check if currently connected to the swarm.
   * @returns {boolean}
   */
  get isConnectedToSwarm() {
    return !!this._rendezvousKey;
  }

  /**
   * Connect to the swarm. Triggers a `connection` event.
   * @param {{ publicKey, secretKey }} rendezvousKey - Shared secret with other peer (to establish a session).
   */
  // TODO(burdon): What is the rendezvous key? Arbitrary? User? Team? Multiple?
  joinSwarm(rendezvousKey) {
    console.assert(rendezvousKey);
    console.assert(!this._rendezvousKey, 'Already connected');

    log(keyName(this._id), 'joining', keyName(rendezvousKey));
    this._rendezvousKey = rendezvousKey;
    this._network.join(discoveryKey(this._rendezvousKey));

    return this;
  }

  /**
   * Disconnect from the swarm. Triggers a `disconnection` event.
   */
  leaveSwarm() {
    console.assert(this._rendezvousKey);

    // TODO(burdon): Error: premature close.
    log(keyName(this._id), 'leaving', keyName(this._rendezvousKey));

    this._network.leave(discoveryKey(this._rendezvousKey));
    this._rendezvousKey = null;

    return this;
  }

  /**
   * Sends a message to peers.
   * @param message
   * @param {[{string}]} peerKeys - array of peer IDs.
   * @returns {Promise<[{ peerKey, response }]>}
   */
  async broadcastMessage(message, peerKeys = null) {
    if (!peerKeys) {
      peerKeys = Array.from(this._peerMap.keys());
    }

    const responses = [];
    await Promise.all(peerKeys.map(async peerKey => {
      const protocol = this._peerMap.get(peerKey);
      const response = await this._messenger.broadcast(protocol, message);

      responses.push({
        peerKey,
        response
      })
    }));

    return responses;
  }

  /**
   * Each protocol instance requires a set of bound extension instances.
   */
  _createExtensions() {
    return [
      this._messenger.createExtension(),

      // TODO(burdon): Messenger test fails if this is declared first.
      ...this._megafeed.createExtensions()
    ];
  }

  async _handleConnect(stream, peerKey) {
    log(keyName(this._id, 'node'), 'connected', keyName(peerKey));

    // Check if we know the rendezvous key for the given discovery key.
    const discoveryToPublicKey = (discoveryKey) => {
      if (keyStr(discoveryKey) === keyStr(discoveryKey(this._rendezvousKey))) {
        return this._rendezvousKey;
      }

      // Matching rendezvous key not found (might have changed recently).
      return  null;
    };

    // Create a new protocol stream.
    let protocol = await new Protocol({ id: this._id, discoveryToPublicKey, live: true })
      // TODO(burdon): User identifier?
      // Note: User and extension data is sent in the handshake message, which is the 2nd message exchanged between peers.
      // Communication is encrypted from the 2nd message onward (https://datprotocol.github.io/how-dat-works/#encryption).
      .setUserData({ user: {} })
      .setExtensions(this._createExtensions())
      .init(this._rendezvousKey);

    // Connect the streams.
    pump(protocol.stream, stream, protocol.stream, err => {
      if (err) {
        // TODO(ashwin): `stream.destroy` issue? (See https://github.com/mafintosh/pump/issues/25).
        if (err.message !== 'premature close') {
          log('Stream error:', err);
          this.emit(err);
        }
      }
    });

    // Handle the handshake.
    protocol.once('handshake', async () => {
      this._peerMap.set(keyStr(peerKey), protocol);
      this.emit('handshake', peerKey);
    });
  }

  async _handleDisconnect(stream, peerKey) {
    // Protocol streams will get disconnected via `pump`.
    this._peerMap.delete(keyStr(peerKey));
    log(keyName(this._id, 'node'), 'disconnected', keyName(peerKey));
  }
}

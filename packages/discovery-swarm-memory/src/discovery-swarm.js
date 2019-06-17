//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { pipeline } from 'stream';
import network from '@wirelineio/hyperswarm-network-memory';

/**
 * DiscoverySwarm
 *
 * Minimal implementation API in memory using hyperswarm-network-memory
 *
 * @extends {EventEmitter}
 */
class DiscoverySwarm extends EventEmitter {

  /**
   * constructor
   *
   * @param {Buffer|string} args.id The peer-id for user.
   * @param {function(info)} args.stream Function that returns the stream to replicate across peers.
   * @returns {undefined}
   */
  constructor(args = {}) {
    super();

    const { id = crypto.randomBytes(32), stream } = args;

    this._id = Buffer.isBuffer(id) ? id : Buffer.from(id);

    this._stream = stream;

    this._network = network({ id: this._id });

    this._network.on('connection', (socket, details) => {
      const info = {
        id: details.id,
        initiator: details.client,
        channel: details.client ? details.peer.topic : null
      };

      if (!this._stream) {
        return this.emit('connection', socket, info);
      }

      socket.setMaxListeners(256);

      const conn = this._stream(details);
      conn.on('handshake', () => {
        this.emit('connection', conn, info);
      });

      pipeline(socket, conn, socket, (err) => {
        if (err) {
          console.log(err);
          this.emit('error', err);
        }
      });
    });

    this._network.on('disconnection', (socket, details) => {
      this.emit('connection-closed', socket, {
        id: details.id,
        initiator: details.client,
        channel: details.client ? details.peer.topic : null
      });
    });
  }

  /**
   * id
   *
   * @returns {Buffer}
   */
  get id() {
    return this._id;
  }

  /**
   * Listen method to respect the original discovery-swarm.
   *
   * @param {number} port
   * @returns {undefined}
   */
  listen(port) {} // eslint-disable-line

  /**
   * Join a channel specified by key (usually a name, hash or id, must be a Buffer or
   * a string). After joining will immediately search for peers advertising this key.
   *
   * @param {Buffer|string} key
   * @returns {undefined}
   */
  join(key) {
    const topic = Buffer.isBuffer(key) ? key : Buffer.from(key);
    this._network.join(topic);
  }

  /**
   * Leave the channel specified key
   *
   * @param {Buffer|string} key
   * @returns {undefined}
   */
  leave(key) {
    const topic = Buffer.isBuffer(key) ? key : Buffer.from(key);
    this._network.leave(topic);
  }
}

export default DiscoverySwarm;

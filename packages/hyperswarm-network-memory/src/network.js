//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import crypto from 'crypto';
import eos from 'end-of-stream';

import { Discovery } from './discovery';

const discovery = new Discovery();

/**
 * Network
 *
 * Minimal implementation of the hyperswarm-network to simulate and test multiple connections in memory.
 *
 * @extends {EventEmitter}
 */
class Network extends EventEmitter {

  /**
   * @constructor
   * @param {Buffer|string} args.id The peer-id for user.
   * @returns {undefined}
   */
  constructor(args = {}) {
    super();

    const { id } = args;

    this._id = id || crypto.randomBytes(32);

    this._connections = new Map();
  }

  /**
   * Join the swarm for the given topic.
   * This will cause peers to be discovered for the topic.
   * Connections will automatically be created to those peers ('connection' event).
   *
   * @param {Buffer} topic
   * @returns {undefined}
   */
  join(topic) {
    discovery.lookup({ peerId: this._id, topic }, (connection, details) => {
      eos(connection, () => {
        this._deleteConnection(connection, details);
      });

      this._addConnection(connection, details);
    });
  }

  /**
   * Leave the swarm for the given topic.
   *
   * @param {Buffer} topic
   * @returns {undefined}
   */
  leave(topic) {
    discovery.leave({ peerId: this._id, topic });

    this._connections.forEach(({ connection, details }) => {
      const { peer } = details;
      if (topic.compare(peer.topic) === 0) {
        connection.destroy();
      }
    });
  }

  /**
   * Called after connecting.
   *
   * Check if the connection belongs to an old connection, in that case destroy the old one.
   * Store the new connection inside of the _connections map.
   * Emit the connection event.
   *
   * @param {Socket} connection
   * @param {Buffer} details.id Id of the remote peer.
   * @param {Boolean} details.client If true, the connection was initiated by this node.
   * @param {Buffer} details.topic The identifier which this peer was discovered under.
   * @returns {undefined}
   */
  _addConnection(connection, details) {
    const { id, client, peer } = details;

    const key = `${peer.topic.toString('hex')}/${id.toString('hex')}`;

    if (this._connections.has(key)) {
      const { connection: oldConnection } = this._connections.get(key);
      oldConnection.destroy();
    }

    this._connections.set(key, { connection, details });

    this.emit('connection', connection, Object.assign({}, details, { peer: client ? peer : null }));
  }

  /**
   * Called after disconnecting.
   *
   * Delete the connection from the _connections map.
   * Emit the disconnection event.
   *
   * @param {Socket} connection
   * @param {Buffer} details.id Id of the remote peer.
   * @param {Boolean} details.client If true, the connection was initiated by this node.
   * @param {Buffer} details.topic The identifier which this peer was discovered under.
   * @returns {undefined}
   */
  _deleteConnection(connection, details) {
    const { id, client, peer } = details;

    const key = `${peer.topic.toString('hex')}/${id.toString('hex')}`;

    if (!this._connections.has(key)) {
      return;
    }

    const { connection: currentConnection } = this._connections.get(key);

    if (connection === currentConnection) {
      this._connections.delete(key);
      this.emit('disconnection', connection, Object.assign({}, details, { peer: client ? peer : null }));
    }
  }
}

export default Network;

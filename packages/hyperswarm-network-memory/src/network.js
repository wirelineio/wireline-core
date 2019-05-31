import { EventEmitter } from 'events';
import crypto from 'crypto';
import eos from 'end-of-stream';

import { Discovery } from './discovery';

const discovery = new Discovery();

class Network extends EventEmitter {
  constructor() {
    super();

    this.id = crypto.randomBytes(6);

    this.connections = new Map();
  }

  join(topic) {
    discovery.lookup({ peerId: this.id, topic }, (connection, details) => {
      eos(connection, () => {
        this._deleteConnection(connection, details);
      });

      this._addConnection(connection, details);

      this.emit('connection', connection, details);
    });
  }

  leave(topic) {
    discovery.leave({ peerId: this.id, topic });

    this.connections.forEach(({ connection, details }) => {
      const { peer } = details;
      if (topic.compare(peer.topic) === 0) {
        connection.destroy();
      }
    });
  }

  _addConnection(connection, details) {
    const { peer: { id, topic } } = details;

    const key = `${topic.toString('hex')}/${id.toString('hex')}`;

    if (this.connections.has(key)) {
      const { connection: oldConnection } = this.connections.get(key);
      oldConnection.destroy();
    }

    this.connections.set(key, { connection, details });
  }

  _deleteConnection(connection, details) {
    const { peer: { id, topic } } = details;

    const key = `${topic.toString('hex')}/${id.toString('hex')}`;

    if (!this.connections.has(key)) {
      return;
    }

    const { connection: currentConnection } = this.connections.get(key);

    if (connection === currentConnection) {
      this.connections.delete(key);
      this.emit('disconnection', connection, details);
    }
  }
}

export { Network };

import { DuplexMock } from 'stream-mock';

class Discovery {
  constructor() {
    this.channels = new Map();
  }

  lookup({ peerId, topic }, cb) {
    let channel;

    if (this.channels.has(topic)) {
      channel = this.channels.get(topic);
    } else {
      channel = new Map();
      this.channels.set(topic, channel);
    }

    if (channel.has(peerId)) {
      return;
    }

    channel.forEach((remoteCallback, remotePeerId) => {
      const connection = new DuplexMock();

      process.nextTick(() => {
        if (connection.destroyed) return;

        cb(connection, {
          type: 'tcp',
          client: true, // Boolean. If true, the connection was initiated by this node.
          peer: {
            id: remotePeerId,
            topic
          }
        });
      });

      process.nextTick(() => {
        if (connection.destroyed) return;

        remoteCallback(connection, {
          type: 'tcp',
          client: false,
          peer: {
            id: peerId,
            topic
          }
        });
      });
    });

    channel.set(peerId, cb);
  }

  leave({ peerId, topic }) {
    if (!this.channels.has(topic)) {
      return;
    }

    const channel = this.channels.get(topic);
    channel.delete(peerId);
  }
}

export { Discovery };

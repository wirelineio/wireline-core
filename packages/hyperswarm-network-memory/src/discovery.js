//
// Copyright 2019 Wireline, Inc.
//

import Socket from './socket';

/**
 * Discovery
 *
 * Class in charge to do the lookup (in memory) of peers in the network with a topic in common.

 */
class Discovery {

  /**
   * constructor
   *
   * @returns {undefined}
   */
  constructor() {
    this._peersByTopic = new Map();
  }

  /**
   * Lookup process.
   *
   * When a new peer joins to a topic the lookup get the list of peers for that topic
   * and for each peer is going to try to establish a connection with the new peer.
   *
   * @param {Object} info
   * @param {Buffer} info.peerId
   * @param {Buffer} info.topic
   * @param {function(socket, details)} cb
   * @returns {undefined}
   */
  lookup(info, cb) {
    const { peerId, topic: bufferTopic } = info;

    const hexTopic = bufferTopic.toString('hex');

    let peers;
    if (this._peersByTopic.has(hexTopic)) {
      peers = this._peersByTopic.get(hexTopic);
    } else {
      peers = new Map();
      this._peersByTopic.set(hexTopic, peers);
    }

    if (peers.has(peerId)) {
      return;
    }

    peers.forEach((remoteCallback, remotePeerId) => {
      const socketOne = new Socket();
      const socketTwo = new Socket();
      socketOne.setEndpoint(socketTwo);

      process.nextTick(() => {
        if (socketOne.destroyed) return;

        cb(socketOne, {
          id: remotePeerId,
          type: 'tcp',
          client: true, // Boolean. If true, the connection was initiated by this node.
          peer: {
            topic: bufferTopic
          }
        });
      });

      process.nextTick(() => {
        if (socketTwo.destroyed) return;

        remoteCallback(socketTwo, {
          id: peerId,
          type: 'tcp',
          client: false,
          peer: {
            topic: bufferTopic
          }
        });
      });
    });

    peers.set(peerId, cb);
  }

  /**
   * Delete a peer from the lookup for a specific topic.
   *
   * @param {Object} info
   * @param {Buffer} info.peerId
   * @param {Buffer} info.topic
   * @returns {undefined}
   */
  leave(info) {
    const { peerId, topic: bufferTopic } = info;
    const hexTopic = bufferTopic.toString('hex');

    if (!this._peersByTopic.has(hexTopic)) {
      return;
    }

    const peers = this._peersByTopic.get(hexTopic);
    peers.delete(peerId);
  }
}

export { Discovery };

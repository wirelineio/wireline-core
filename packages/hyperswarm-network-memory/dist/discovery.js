"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Discovery = void 0;

var _socket = _interopRequireDefault(require("./socket"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//
// Copyright 2019 Wireline, Inc.
//
class Discovery {
  constructor() {
    this._peersByTopic = new Map();
  }

  lookup({
    peerId,
    topic: bufferTopic
  }, cb) {
    let peers;
    const hexTopic = bufferTopic.toString('hex');

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
      const socketOne = new _socket.default();
      const socketTwo = new _socket.default();
      socketOne.setRemote(socketTwo);
      process.nextTick(() => {
        if (socketOne.destroyed) return;
        cb(socketOne, {
          id: remotePeerId,
          type: 'tcp',
          client: true,
          // Boolean. If true, the connection was initiated by this node.
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

  leave({
    peerId,
    topic
  }) {
    const hexTopic = topic.toString('hex');

    if (!this._peersByTopic.has(hexTopic)) {
      return;
    }

    const peers = this._peersByTopic.get(hexTopic);

    peers.delete(peerId);
  }

}

exports.Discovery = Discovery;
//# sourceMappingURL=discovery.js.map
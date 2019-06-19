//
// Copyright 2019 Wireline, Inc.
//

/**
 * Graph of connections.
 */
class ConectionMap {

  constructor(root) {
    this._root = root;
    this._peerMap = {
      [root]: []
    };
  }

  get root() {
    return this._root;
  }

  get peers() {
    return Object.keys(this._peerMap);
  }

  _getOrCreateConnetions(peerId) {
    let connections = this._peerMap[peerId];
    if (!connections) {
      connections = {};
      this._peerMap[peerId] = connections;
    }

    return connections;
  }

  getConnections(peerId) {
    return Object.keys(this._peerMap[peerId]) || [];
  }

  connect(source, target) {
    this._getOrCreateConnetions(target);
    const connections = this._getOrCreateConnetions(source);
    connections[target] = Date.now();

    return this;
  }

  disconnect(source, target) {
    const connections = this._getOrCreateConnetions(source);
    delete connections[target];

    // TODO(burdon): Assumes root centric.
    delete this._peerMap[target];

    return this;
  }
}

module.exports = ConectionMap;

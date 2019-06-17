"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _events = require("events");

var _crypto = _interopRequireDefault(require("crypto"));

var _endOfStream = _interopRequireDefault(require("end-of-stream"));

var _discovery = require("./discovery");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//
// Copyright 2019 Wireline, Inc.
//
const discovery = new _discovery.Discovery();

class Network extends _events.EventEmitter {
  constructor(args = {}) {
    super();
    const {
      id
    } = args;
    this._id = id || _crypto.default.randomBytes(32);
    this._connections = new Map();
  }

  join(topic) {
    discovery.lookup({
      peerId: this._id,
      topic
    }, (connection, details) => {
      (0, _endOfStream.default)(connection, () => {
        this._deleteConnection(connection, details);
      });

      this._addConnection(connection, details);
    });
  }

  leave(topic) {
    discovery.leave({
      peerId: this._id,
      topic
    });

    this._connections.forEach(({
      connection,
      details
    }) => {
      const {
        peer
      } = details;

      if (topic.compare(peer.topic) === 0) {
        connection.destroy();
      }
    });
  }

  _addConnection(connection, details) {
    const {
      id,
      client,
      peer
    } = details;
    const key = `${peer.topic.toString('hex')}/${id.toString('hex')}`;

    if (this._connections.has(key)) {
      const {
        connection: oldConnection
      } = this._connections.get(key);

      oldConnection.destroy();
    }

    this._connections.set(key, {
      connection,
      details
    });

    this.emit('connection', connection, Object.assign({}, details, {
      peer: client ? peer : null
    }));
  }

  _deleteConnection(connection, details) {
    const {
      id,
      client,
      peer
    } = details;
    const key = `${peer.topic.toString('hex')}/${id.toString('hex')}`;

    if (!this._connections.has(key)) {
      return;
    }

    const {
      connection: currentConnection
    } = this._connections.get(key);

    if (connection === currentConnection) {
      this._connections.delete(key);

      this.emit('disconnection', connection, Object.assign({}, details, {
        peer: client ? peer : null
      }));
    }
  }

}

var _default = Network;
exports.default = _default;
//# sourceMappingURL=network.js.map
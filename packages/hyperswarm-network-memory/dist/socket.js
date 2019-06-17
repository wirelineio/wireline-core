"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _stream = require("stream");

//
// Copyright 2019 Wireline, Inc.
//
class Socket extends _stream.Duplex {
  constructor(options) {
    super(options);
    this._remote = null;
  } // eslint-disable-next-line


  _write(data, enc, cb) {
    setTimeout(() => {
      this._remote.send(data);

      cb(null, data);
    }, 1);
  } // eslint-disable-next-line


  _read() {}

  setRemote(socket) {
    this._remote = socket;

    if (socket._remote !== this) {
      socket.setRemote(this);
    }
  }

  send(buffer) {
    if (this.destroyed) return;
    setTimeout(() => {
      if (this.destroyed) return;
      this.push(buffer);
    }, 1);
  }

}

var _default = Socket;
exports.default = _default;
//# sourceMappingURL=socket.js.map
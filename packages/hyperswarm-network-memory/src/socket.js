//
// Copyright 2019 Wireline, Inc.
//

import { Duplex } from 'stream';

/**
 * Socket
 *
 * DuplexStream that simulate a network connection beetwen two endpoints.
 *
 * @extends {Duplex}
 */
class Socket extends Duplex {

  /**
   * constructor
   *
   * @returns {undefined}
   */
  constructor() {
    super();

    this._endpoint = null;
  }

  /**
   * Set the socket endpoint where the local one is going to send the data.
   *
   * @param {Socker} socket
   * @returns {undefined}
   */
  setEndpoint(socket) {
    this._endpoint = socket;
    if (socket._endpoint !== this) {
      socket.setEndpoint(this);
    }
  }

  /**
   * Send data to one socket to another.
   *
   * @param {Buffer} buffer
   * @returns {undefined}
   */
  send(buffer) {
    if (this.destroyed) return;

    setTimeout(() => {
      if (this.destroyed) return;

      this.push(buffer);
    }, 1);
  }

  /**
   * Private _write hook method required by the DuplexStream class.
   *
   * @param {Buffer} data
   * @param {string} enc
   * @param {function(err, data)} cb
   * @returns {undefined}
   */
  _write(data, enc, cb) {
    if (this.destroyed) return;

    setTimeout(() => {
      this._endpoint.send(data);
      cb(null, data);
    }, 1);
  }

  _read() {} // eslint-disable-line

  _destroy(err) {
    if (err) {
      this.emit('error', err);
    }

    if (!this._readableState.ended) this.push(null);
    if (!this._writableState.finished) this.end();

    this.emit('close');
  }
}

export default Socket;

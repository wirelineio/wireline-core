//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';

import { Extension } from './extension';
import { ProtocolError } from './protocol';

const log = debug('protocol:auth');

/**
 * An extension to require nodes to be authenticated
 * during handshake before being allowed to replicate.
 */
export class Auth extends EventEmitter {

  static EXTENSION_NAME = 'auth';

  /**
   * @constructor
   * @param {string} peerId
   * @param authentication
   */
  constructor(peerId, authentication = null) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
    this._authentication = authentication;
  }

  get authentication() {
    return this._authentication;
  }

  set authentication(value) {
    this._authentication = value;
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Auth.EXTENSION_NAME, { binary: true })
      .setHandshakeHandler(this._onHandshake.bind(this));
  }

  async _onHandshake(protocol, context) {
    if (!this.authentication) {
      log('authentication not configured!');
      return;
    }

    if (await this._authentication.authenticate(context.auth)) {
      log('Authenticated!');
    } else {
      throw new ProtocolError(401, 'Unauthorized access rejected!');
    }
  }
}

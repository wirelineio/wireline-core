//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';

import { Extension } from './extension';

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
   * @param authenticator
   */
  constructor(peerId, authenticator = null) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
    this._authenticator = authenticator;
  }

  get authenticator() {
    return this._authenticator;
  }

  set authenticator(value) {
    this._authenticator = value;
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
    if (!this.authenticator) {
      log('Not authenticator configured!');
      return;
    }

    if (await this._authenticator.authenticate(context.auth)) {
      log('Authenticated!');
    } else {
      throw new Error('Unauthorized access rejected!');
    }
  }
}

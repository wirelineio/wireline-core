//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';

import { Authenticator } from './authenticator';
import { Extension } from './extension';

const log = debug('protocol:auth:extension');

/**
 * Authentication
 */
export class Auth extends EventEmitter {

  static EXTENSION_NAME = 'auth';

  /**
   * @constructor
   * @param {string} peerId
   * @param authHints
   */
  constructor(peerId, authHints) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;

    this._framework = null;
    this._authHints = authHints;
  }

  setFramework(framework) {
    this._framework = framework;
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
    const authenticator = new Authenticator(this._authHints);
    await authenticator.build(this._framework);

    if (await authenticator.authenticate(context.auth)) {
      log('Authenticated!');
    } else {
      throw new Error('Unauthorized access rejected!');
    }
  }
}

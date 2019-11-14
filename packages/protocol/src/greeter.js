//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';

import { Extension } from './extension';

const log = debug('protocol:auth');

/**
 * An extension for "greeting" nodes.  The Greeter
 * operates on party A in the open, verifying nodes'
 * invitations before they are admitted to party B,
 * which requires authentication.
 */
export class Greeter extends EventEmitter {

  static EXTENSION_NAME = 'greeter';

  /**
   * @constructor
   * @param {string} peerId
   * @param authenticator
   */
  constructor(peerId) {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Greeter.EXTENSION_NAME, { binary: true })
      .setHandshakeHandler(this._onHandshake.bind(this));
  }

  async _onHandshake(protocol, context) {
  }
}

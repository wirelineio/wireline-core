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
  constructor(peerId, codec, authentication = null) {
    super();

    console.assert(Buffer.isBuffer(peerId));
    console.assert(codec);

    this._peerId = peerId;
    this._authentication = authentication;
    this._codec = codec;
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

    let creds = context.auth;

    if (creds) {
      if (!Buffer.isBuffer(creds)) {
        creds = Buffer.from(creds, 'base64');
      }
      try {
        creds = this._codec.decode(creds);
      } catch (e) {
        protocol.stream.destroy();
        throw new ProtocolError(401, e);
      }
    }

    // TODO(telackey): The signed auth message should contain verifiable information for both ends, eg,
    //  the ID of both source and target, and a nonce or challenge provided by the target to the source
    //  for this particular exchange.  We will need to add appropriate hooks between the connect and
    //  handshake calls to do that though.

    if (await this._authentication.authenticate(creds)) {
      log('Authenticated!');
    } else {
      protocol.stream.destroy();
      throw new ProtocolError(401, 'Unauthorized access rejected!');
    }
  }
}

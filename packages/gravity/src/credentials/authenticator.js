//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

import { Extension } from '@wirelineio/protocol';

import { random } from '../util';

import { createAuthProofPayload, verifyAuthProof } from './helpers';

/**
 * Manages peer authentication.
 */
export class Authenticator extends EventEmitter {

  static extension = 'authenticator';

  /**
   * @param {AuthProvider} authProvider
   * @param {Object} [options]
   * @param {Number} [options.timeout]
   */
  constructor(authProvider, options = {}) {
    super();
    console.assert(authProvider);

    this._options = Object.assign({
      timeout: 1000
    }, options);

    this._authProvider = authProvider;
  }

  toString() {
    const meta = {};

    return `Authenticator(${JSON.stringify(meta)})`;
  }

  /**
   * Creates a protocol extension for peer authentication.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Authenticator.extension, { timeout: this._options.timeout })
      .on('error', err => this.emit(err))
      .setHandshakeHandler(this._handshakeHandler.bind(this))
      .setMessageHandler(this._messageHandler.bind(this));
  }

  /**
   * Challenges peer to authenticate.
   *
   * @param {Protocol} protocol
   * @returns {Promise<void>}
   */
  async _handshakeHandler(protocol) {
    const extension = protocol.getExtension(Authenticator.extension);
    console.assert(extension);

    extension.on('error', err => {
      console.warn('Auth error: %o', err);
      protocol.stream.destroy();
    });

    const { user: peerPublicKey } = protocol.getContext();
    console.assert(peerPublicKey);

    const nonce = random.prime();
    const { response: { proof } } = await extension.send({
      type: 'challenge',
      request: createAuthProofPayload(Buffer.from(peerPublicKey, 'hex'), nonce)
    });

    const verified = verifyAuthProof(proof, nonce, peerPublicKey);
    if (!verified) {
      // Close stream if auth fails.
      extension.emit('auth:error');
      return protocol.stream.destroy();
    }

    extension.emit('auth:success');
  }

  /**
   * Handles authentication requests from peer.
   *
   * @param {Protocol} protocol
   * @param {Object} context
   * @param {Object} message
   */
  async _messageHandler(protocol, context, message) {
    const { type, request } = message;

    switch (type) {
      case 'challenge': {
        return {
          proof: await this._authProvider.requestSignature(request)
        }
      }

      // Error.
      default: {
        throw new Error('Invalid type: ' + type);
      }
    }
  }
}

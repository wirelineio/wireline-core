//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { keyPair as hyperKeyPair, sign as hyperSign, verify as hyperVerify } from 'hypercore-crypto';

import { keyToHex, keyToBuffer } from '@wirelineio/utils';

const log = debug('creds:crypto'); // eslint-disable-line no-unused-vars

/* eslint-disable no-unused-vars */

/**
 * CryptoEngine interface.
 */
export class CryptoEngine {
  async generateKeyPair(params = {}) {
    throw new Error('Not implemented');
  }

  async friendly(key) {
    throw new Error('Not implemented');
  }

  async sign(message, secretKey) {
    throw new Error('Not implemented');
  }

  async verify(message, signature, publicKey) {
    throw new Error('Not implemented');
  }
}

/* eslint-enable no-unused-vars */

/**
 * hypercore-crypto based implementation of the CryptoEngine interface.
 */
export class HyperCryptoEngine extends CryptoEngine {
  async generateKeyPair(params = {}) {
    const { seed } = params;
    const created = hyperKeyPair(seed);

    return {
      publicKey: created.publicKey,
      secretKey: created.secretKey,
    };
  }

  async friendly(publicKey) {
    if (publicKey.publicKey) {
      publicKey = publicKey.publicKey;
    }
    if (!Buffer.isBuffer(publicKey)) {
      publicKey = Buffer.from(publicKey);
    }
    return keyToHex(publicKey);
  }

  async sign(message, secretKey) {
    if (secretKey.secretKey) {
      secretKey = secretKey.secretKey;
    }

    if (!Buffer.isBuffer(message)) {
      message = Buffer.from(message);
    }

    if (!Buffer.isBuffer(secretKey)) {
      secretKey = keyToBuffer(secretKey);
    }

    return hyperSign(message, secretKey).toString('base64');
  }

  async verify(message, signature, publicKey) {
    if (publicKey.publicKey) {
      publicKey = publicKey.publicKey;
    }

    if (!Buffer.isBuffer(signature)) {
      signature = Buffer.from(signature, 'base64');
    }

    if (!Buffer.isBuffer(message)) {
      message = Buffer.from(message);
    }

    if (!Buffer.isBuffer(publicKey)) {
      publicKey = keyToBuffer(publicKey);
    }

    return hyperVerify(message, signature, publicKey);
  }
}

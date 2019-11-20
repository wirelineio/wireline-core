//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';

import { keyToHex, keyToBuffer } from '@wirelineio/utils';

const log = debug('creds:crypto'); // eslint-disable-line no-unused-vars


/**
 * hypercore-crypto based
 */
export class HyperCryptoEngine {
  async generateKeyPair(params = {}) {
    const { seed } = params;
    const created = crypto.keyPair(seed);

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

    return crypto.sign(message, secretKey).toString('base64');
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

    return crypto.verify(message, signature, publicKey);
  }
}

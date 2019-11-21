//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import stableStringify from 'json-stable-stringify';

import { keyToBuffer, keyToHex } from '@wirelineio/utils';

import { KeyStoreMem } from './keystore';

const log = debug('creds:keyring'); // eslint-disable-line no-unused-vars

export const KeyTypes = Object.freeze({
  IDENTITY: 'IDENTITY',
  PSEUDONYM: 'PSEUDONYM',
  DEVICE: 'DEVICE',
  DEVICE_IDENTITY: 'DEVICE_IDENTITY',
  DEVICE_PSEUDONYM: 'DEVICE_PSEUDONYM',
});

export class Keyring {
  constructor(params = {}) {
    const { keystore } = params;

    this._keystore = keystore || new KeyStoreMem();
  }

  async generate(attributes = {}) {
    const { seed } = attributes;
    const keypair = crypto.keyPair(seed);

    attributes.key = keyToHex(keypair.publicKey);

    return this._keystore.store(keypair, attributes);
  }

  get identity() {
    return this.findOne({ type: KeyTypes.IDENTITY, secretKey: { $exists: true } });
  }

  get pseudonym() {
    return this.findOne({ type: KeyTypes.PSEUDONYM, secretKey: { $exists: true } });
  }

  get device() {
    return this.findOne({ type: KeyTypes.DEVICE, secretKey: { $exists: true } });
  }

  get deviceIdentity() {
    return this.findOne({ type: KeyTypes.DEVICE_IDENTITY, secretKey: { $exists: true } });
  }

  get devicePseudonym() {
    return this.findOne({ type: KeyTypes.DEVICE_PSEUDONYM, secretKey: { $exists: true } });
  }

  get keys() {
    return this.find();
  }

  key(criteria = {}) {
    return this.findOne(criteria);
  }

  findOne(criteria = {}) {
    const ret = this.find(criteria);
    return ret.length ? ret[0] : null;
  }

  find(criteria = {}) {
    return this._keystore.find(criteria);
  }

  async verify(message, signature = null, key = null) {
    if (!signature && !key) {
      let { signed, signatures } = message;
      if (message.data && (!signed || !signatures)) {
        signed = message.data.signed;
        signatures = message.data.signatures;
      }
      for await (const sig of signatures) {
        const result = await this.verify(signed, sig.signature, sig.key);
        if (!result) {
          log('Signature could not be verified for', sig.signature, sig.key, 'on message', message);
          return false;
        }
      }
      return true;
    }

    if (typeof message === 'object') {
      message = stableStringify(message);
    }

    if (key.publicKey) {
      key = key.publicKey;
    }

    if (!Buffer.isBuffer(signature)) {
      signature = Buffer.from(signature, 'base64');
    }

    if (!Buffer.isBuffer(message)) {
      message = Buffer.from(message);
    }

    if (!Buffer.isBuffer(key)) {
      key = keyToBuffer(key);
    }

    return crypto.verify(message, signature, key);
  }

  async sign(message, keys) {
    if (!Array.isArray(keys)) {
      keys = [keys];
    }

    const data = {
      original: message,
      nonce: Math.random(),
      created: Date.now(),
    };

    const flat = stableStringify(data);

    const ret = {
      signed: data,
      signatures: []
    };

    for await (const key of keys) {
      const sig = {
        signature: await this._sign(flat, key.secretKey),
        key: keyToHex(key.publicKey)
      };
      ret.signatures.push(sig);
    }

    return ret;
  }

  _sign(message, secretKey) {
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
}

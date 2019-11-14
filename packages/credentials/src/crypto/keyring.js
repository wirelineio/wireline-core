//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import stableStringify from 'json-stable-stringify';

import { HyperCryptoEngine } from './crypto';
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
    const { keystore, crypto } = params;

    this._keystore = keystore || new KeyStoreMem();
    this._crypto = crypto || new HyperCryptoEngine();
  }

  async generate(attributes = {}) {
    const keypair = await this._crypto.generateKeyPair(attributes);
    attributes.key = await this._crypto.friendly(keypair.publicKey);
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

  async verify(message, signature, key) {
    if (typeof message === 'object') {
      message = stableStringify(message);
    }
    return this._crypto.verify(message, signature, key);
  }

  async sign(message, keys) {
    if (!Array.isArray(keys)) {
      keys = [keys];
    }

    const data = {
      message,
      nonce: Math.random(),
      signed_at: Date.now(),
    };

    const flat = stableStringify(data);

    const ret = {
      data,
      signatures: []
    };

    for await (const key of keys) {
      const sig = {
        signature: await this._crypto.sign(flat, key.secretKey),
        key: await this._crypto.friendly(key.publicKey)
      };
      ret.signatures.push(sig);
    }

    return ret;
  }
}

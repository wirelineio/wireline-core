//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import stableStringify from 'json-stable-stringify';

import { keyToBuffer, keyToHex } from '@wirelineio/utils';

import { KeyStore } from './keystore';

const log = debug('creds:keyring');

export const KeyTypes = Object.freeze({
  IDENTITY: 'IDENTITY',
  PSEUDONYM: 'PSEUDONYM',
  DEVICE: 'DEVICE',
  DEVICE_IDENTITY: 'DEVICE_IDENTITY',
  DEVICE_PSEUDONYM: 'DEVICE_PSEUDONYM',
  PARTY: 'PARTY',
  FEED: 'FEED',
});

export class Keyring {
  constructor(params = {}) {
    const { keystore } = params;

    this._keystore = keystore || new KeyStore();
  }

  async generate(attributes = {}) {
    const { seed } = attributes;
    const keypair = crypto.keyPair(seed);

    attributes.trusted = true;
    attributes.own = true;

    return this.add(keypair, attributes);
  }

  async add(key, attributes = {}) {
    if (typeof key === 'string' || key instanceof String) {
      key = {
        publicKey: keyToBuffer(key),
      };
    } else if (Buffer.isBuffer(key)) {
      key = {
        publicKey: keyToBuffer(key),
      };
    }

    const withDefaults = Object.assign({
      own: false,
      hint: false,
      trusted: true,
      key: keyToHex(key.publicKey),
    }, attributes);

    return this._keystore.store(key, withDefaults);
  }

  get identity() {
    return this.findOne({ type: KeyTypes.IDENTITY, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get pseudonym() {
    return this.findOne({ type: KeyTypes.PSEUDONYM, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get device() {
    return this.findOne({ type: KeyTypes.DEVICE, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get deviceIdentity() {
    return this.findOne({ type: KeyTypes.DEVICE_IDENTITY, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get devicePseudonym() {
    return this.findOne({ type: KeyTypes.DEVICE_PSEUDONYM, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get party() {
    return this.findOne({ type: KeyTypes.PARTY, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get feed() {
    return this.findOne({ type: KeyTypes.FEED, trusted: true, own: true, secretKey: { $exists: true } });
  }

  get keys() {
    return this.find();
  }

  has(key, trusted = true) {
    return !!this.get(key, trusted);
  }

  get(key, trusted = true) {
    if (key.publicKey) {
      key = keyToHex(key.publicKey);
    }

    if (key.data && key.type === 'Buffer') {
      key = Buffer.from(key);
    }

    if (Buffer.isBuffer(key)) {
      key = keyToHex(key);
    }

    return this.findOne({ key, trusted });
  }

  findOne(criteria = {}) {
    if (Buffer.isBuffer(criteria.key)) {
      criteria.key = keyToHex(criteria.key);
    }

    const ret = this.find(criteria);
    return ret.length ? ret[0] : null;
  }

  find(criteria = {}) {
    if (Buffer.isBuffer(criteria.key)) {
      criteria.key = keyToHex(criteria.key);
    }
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
          log(`Bad signature ${sig.signature} ${sig.key}:`, message);
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

    const data = Object.assign({
      created: Date.now(),
      nonce: crypto.randomBytes(32)
    }, message);

    const flat = stableStringify(data);

    const ret = {
      signed: data,
      signatures: []
    };

    for await (const key of keys) {
      const sig = {
        signature: await this._sign(flat, key.secretKey),
        key: key.publicKey
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

    return crypto.sign(message, secretKey);
  }
}

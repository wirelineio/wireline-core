//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import Loki from 'lokijs';

import { keyToHex } from '@wirelineio/utils';

const log = debug('creds:keystore'); // eslint-disable-line no-unused-vars

export class KeyStore {
  constructor() {
    this._db = new Loki('keystore.db');
    this._keys = this._db.addCollection('keys');
  }

  store(keyOrKeypair, attributes = {}) {
    let { publicKey, secretKey } = keyOrKeypair;

    if (!publicKey && !secretKey) {
      publicKey = keyOrKeypair;
    }

    let { key } = attributes;
    if (!key) {
      key = keyToHex(publicKey);
    }

    const existing = this._keys.findOne({ 'attributes.key': key });
    if (existing) {
      this._keys.remove(existing.$loki);
    }

    return this._keys.insert({
      publicKey,
      secretKey,
      ...attributes
    });
  }

  find(attributes = {}) {
    return this._keys.find(attributes);
  }
}

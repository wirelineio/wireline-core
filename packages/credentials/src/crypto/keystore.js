//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import Loki from 'lokijs';

const log = debug('creds:keystore'); // eslint-disable-line no-unused-vars

/* eslint-disable no-unused-vars */
export class KeyStore {
  constructor(props) {
    this._props = props;
  }

  store(keyOrKeypair, attributes = {}) {
    throw new Error('Not implemented');
  }

  find(attributes = {}) {
    throw new Error('Not implemented');
  }
}
/* eslint-enable no-unused-vars */

export class KeyStoreMem extends KeyStore {
  constructor(props) {
    super(props);
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
      // TODO(telackey): This conversion should be done by the CryptoEngine.
      key = publicKey.toString('hex');
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

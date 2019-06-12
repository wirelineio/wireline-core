//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

// TODO(burdon): Standardize utils (factor out with gravity).

function keyToBuffer(key) {
  if (!key) {
    return key;
  }

  return Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
}

// TODO(burdon): Standardize export?

exports.keyToHex = (key) => {
  if (Buffer.isBuffer(key)) {
    return key.toString('hex');
  }

  return key;
};

exports.getDiscoveryKey = key => crypto.discoveryKey(keyToBuffer(key));

exports.parseToKeys = (key) => {
  const keyBuffer = keyToBuffer(key);

  return {
    publicKey: keyBuffer,
    discoveryKey: crypto.discoveryKey(keyBuffer)
  };
};

exports.keyToBuffer = keyToBuffer;

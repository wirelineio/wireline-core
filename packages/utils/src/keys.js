//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

function keyToBuffer(key) {
  // TODO(burdon): Defensive.
  console.assert(key);
  if (!key) {
    return key;
  }

  // TODO(burdon): Be consistent.
  return Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
}

exports.keyToHex = (key) => {
  // TODO(burdon): Force consistency.
  if (Buffer.isBuffer(key)) {
    return key.toString('hex');
  }

  return key;
};

exports.getDiscoveryKey = key => crypto.discoveryKey(keyToBuffer(key));

exports.parseToKeys = (key) => {
  const bKey = keyToBuffer(key);
  return {
    publicKey: bKey,
    discoveryKey: crypto.discoveryKey(bKey)
  };
};

exports.keyToBuffer = keyToBuffer;

//
// Copyright 2019 Wireline, Inc.
//

const hypercore = require('hypercore');

function keyToBuffer(key) {
  if (!key) {
    return key;
  }

  return Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
}

exports.keyToHex = (key) => {
  if (Buffer.isBuffer(key)) {
    return key.toString('hex');
  }

  return key;
};

exports.getDiscoveryKey = key => hypercore.discoveryKey(keyToBuffer(key));

exports.parseToKeys = (key) => {
  const bKey = keyToBuffer(key);
  return {
    publicKey: bKey,
    discoveryKey: hypercore.discoveryKey(bKey)
  };
};

exports.keyToBuffer = keyToBuffer;

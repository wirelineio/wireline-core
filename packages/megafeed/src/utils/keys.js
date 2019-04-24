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

exports.keyToHex = key => {
  if (Buffer.isBuffer(key)) {
    return key.toString('hex');
  }

  return key;
};

exports.getDiscoveryKey = key => {
  key = keyToBuffer(key);
  return hypercore.discoveryKey(key);
};

exports.parseToKeys = key => {
  key = keyToBuffer(key);
  return {
    publicKey: key,
    discoveryKey: hypercore.discoveryKey(key)
  };
};

exports.keyToBuffer = keyToBuffer;


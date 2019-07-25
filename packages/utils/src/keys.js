//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');
const HumanHasher = require('humanhash');

const hasher = new HumanHasher();

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

exports.getDiscoveryKey = key => crypto.discoveryKey(keyToBuffer(key));

exports.parseToKeys = (key) => {
  const bKey = keyToBuffer(key);
  return {
    publicKey: bKey,
    discoveryKey: crypto.discoveryKey(bKey)
  };
};

exports.keyToBuffer = keyToBuffer;

exports.keyToHuman = (key, prefix) => {
  const name = hasher.humanize(key.toString('hex'));
  if (prefix) {
    return `${prefix}(${name})`;
  }

  return name;
};

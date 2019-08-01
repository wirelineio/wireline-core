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

function keyToHex(key) {
  if (Buffer.isBuffer(key)) {
    return key.toString('hex');
  }

  return key;
}

function getDiscoveryKey(key) {
  return crypto.discoveryKey(keyToBuffer(key));
}

function parseToKeys(key) {
  const bKey = keyToBuffer(key);
  return {
    publicKey: bKey,
    discoveryKey: crypto.discoveryKey(bKey)
  };
}

function keyToHuman(key, prefix) {
  const name = hasher.humanize(keyToHex(key));
  if (prefix) {
    return `${prefix}(${name})`;
  }

  return name;
}

module.exports = {
  keyToBuffer,
  keyToHex,
  getDiscoveryKey,
  parseToKeys,
  keyToHuman
};

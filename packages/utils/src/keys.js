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
  const buffer = keyToBuffer(key);

  return {
    publicKey: buffer,
    discoveryKey: crypto.discoveryKey(buffer)
  };
}

function keyToHuman(key, prefix) {
  const name = hasher.humanize(keyToHex(key));
  if (prefix) {
    return `${prefix}(${name})`;
  }

  return name;
}

const keyMeta = (key) => {
  return {
    key: keyToHex(key),
    name: keyToHuman(key)
  };
};

module.exports = {
  getDiscoveryKey,
  keyMeta,
  keyToBuffer,
  keyToHex,
  keyToHuman,
  parseToKeys,
};

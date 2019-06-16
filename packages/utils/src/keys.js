//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

// TODO(burdon): This is a really bad pattern. Methods should expect a particular type and fail otherwise.
function keyToBuffer(key) {
  if (!key) {
    return key;
  }

  return Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
}

// TODO(burdon): This is a really bad pattern. Methods should expect a particular type and fail otherwise.
exports.keyToHex = (key) => {
  if (Buffer.isBuffer(key)) {
    return key.toString('hex');
  }

  return key;
};

// TODO(burdon): Methods randomly expect buffer or strings; need to be consistent.
exports.getDiscoveryKey = key => crypto.discoveryKey(keyToBuffer(key));

exports.parseToKeys = (key) => {
  const bKey = keyToBuffer(key);
  return {
    publicKey: bKey,
    discoveryKey: crypto.discoveryKey(bKey)
  };
};

// TODO(burdon): Be consistent.
exports.keyToBuffer = keyToBuffer;

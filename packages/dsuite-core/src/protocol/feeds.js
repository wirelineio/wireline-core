//
// Copyright 2019 Wireline, Inc.
//

const varint = require('varint');

const { keyToBuffer } = require('@wirelineio/utils');

// TODO(burdon): Remove '-feed'.
const TYPES = {
  'control-feed': 0,
  'party-feed': 1
};

const INVERTED_TYPES = Object.keys(TYPES).reduce(
  (result, next) => ({
    ...result, [TYPES[next]]: next
  }),
  {}
);

exports.encodeFeedKey = function encodeFeedKey(type, feedKey) {
  const feedBuffer = keyToBuffer(feedKey);
  const typeBuffer = varint.encode(TYPES[type], Buffer.alloc(1));
  return Buffer.concat([typeBuffer, feedBuffer], typeBuffer.length + feedBuffer.length);
};

exports.decodeFeedKey = function decodeFeedKey(buffer) {
  return {
    type: INVERTED_TYPES[varint.decode(buffer, 0)],
    key: buffer.slice(varint.decode.bytes)
  };
};

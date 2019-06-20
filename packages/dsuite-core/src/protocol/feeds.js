//
// Copyright 2019 Wireline, Inc.
//

const varint = require('varint');
const { Megafeed } = require('@wirelineio/megafeed');

// TODO(burdon): Remove '-feed'.
const TYPES = {
  'control-feed': 0,
  'party-feed': 1
};

const INVERTED_TYPES = Object.keys(TYPES).reduce((result, next) => ({ ...result, [TYPES[next]]: next }), {});

// TODO(burdon): Create codec?

exports.encodeFeedKey = function encodeFeedKey(type, feedKey) {
  const feedBuffer = Megafeed.keyToBuffer(feedKey);
  const typeBuffer = varint.encode(TYPES[type], Buffer.alloc(1));
  return Buffer.concat([typeBuffer, feedBuffer], typeBuffer.length + feedBuffer.length);
};

exports.decodeFeedKey = function decodeFeedKey(buffer) {
  return {
    type: INVERTED_TYPES[varint.decode(buffer, 0)],
    key: buffer.slice(varint.decode.bytes)
  };
};

const Codec = require('@wirelineio/codec-protobuf');

const schema = require('./schema.json');

const codec = new Codec({ verify: true });
codec.loadFromJSON(schema);

module.exports = codec;

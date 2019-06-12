//
// Copyright 2019 Wireline, Inc.
//

const codecProtobuf = require('@wirelineio/codec-protobuf');

const schema = require('./schema.js');

module.exports = codecProtobuf(schema);

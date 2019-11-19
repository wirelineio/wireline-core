//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/protobuf/src';

const schema = require('./schema.json');

/**
 * Top-level message codec.
 */
export class MessageCodec {

  constructor() {
    this._codec = new Codec().addJson(schema).build();
  }

  addJson(schema) {
    this._codec.addJson(schema);
    return this;
  }

  build() {
    this._codec.build();
    return this;
  }

  encode(message) {
    return this._codec.encode(message, '.dxos.Message');
  }

  decode(buffer) {
    return this._codec.decode(buffer, '.dxos.Message');
  }
}

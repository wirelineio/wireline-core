//
// Copyright 2019 Wireline, Inc.
//

import CodecProtobuf from '@dxos/codec-protobuf';

// eslint-disable-next-line
import schema from './schema.json';

/**
 * Encodes and decodes messages.
 */
export class Codec {
  constructor(options = {}) {
    const { binary = false } = options;
    this._codec = new CodecProtobuf({ verify: true });
    this._codec.loadFromJSON(schema);
    this._binary = binary;
  }

  /**
   * @param {Object|Buffer} message
   * @returns {Buffer}
   */
  encode(message) {
    const { id } = message;
    let { data = {}, options = {}, error } = message;

    data = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    options = Buffer.from(JSON.stringify(options));
    error = error && Buffer.from(JSON.stringify(error));

    // TODO(burdon): Move type to const.
    return this._codec.encode({ type: 'protocol.Request', message: { id, data, error, options } });
  }

  /**
   * @param {Buffer} buffer
   * @returns {Buffer}
   */
  decode(buffer) {
    try {
      const request = this._codec.decode(buffer, false);
      request.data = this._binary ? request.data : JSON.parse(request.data);
      request.options = JSON.parse(request.options);
      request.error = request.error && JSON.parse(request.error);
      return request;
    } catch (err) {
      return {};
    }
  }
}

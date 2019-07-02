//
// Copyright 2019 Wireline, Inc.
//

import bufferFrom from 'buffer-from';

/**
 * Encodes and decodes messages.
 */
export class Codec {

  // TODO(burdon): Use protobuf.

  /**
   * @param {Object} message
   * @returns {string}
   */
  encode(message) {
    return bufferFrom(JSON.stringify(message || {}));
  }

  /**
   * @param {string} message
   * @returns {Object}
   */
  decode(message) {
    return message ? JSON.parse(message.toString()) : {};
  }
}

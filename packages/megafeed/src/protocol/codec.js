//
// Copyright 2019 Wireline, Inc.
//

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
    return Buffer.from(JSON.stringify(message || {}));
  }

  /**
   * @param {string} message
   * @returns {Object}
   */
  decode(message) {
    return message ? JSON.parse(message.toString()) : {};
  }
}

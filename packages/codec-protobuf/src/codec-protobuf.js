//
// Copyright 2019 Wireline, Inc.
//

const { AnyType } = require('./schema.js');

/**
 * encode / decode protobuffers
 *
 * mapping {
 *   'Message1': 1,
 *   'Message2': 2
 * }
 */
function codecProtobuf(root) {
  return {
    encode: function encodeProtobuf(obj) {
      if (typeof obj !== 'object') {
        throw new Error('CodecProtobuf: The encode message needs to be an object { type, message }.');
      }

      const { type, message } = obj;

      const Message = root[type];

      const value = Message.encode(message);

      return AnyType.encode({ type, value });
    },

    decode: function decodeProtobuf(buffer, onlyMessage = true) {
      const { type, value } = AnyType.decode(buffer);

      const Message = root[type];

      const message = Message.decode(value);

      if (onlyMessage) {
        return message;
      }

      return {
        type,
        message
      };
    }
  };
}

module.exports = codecProtobuf;

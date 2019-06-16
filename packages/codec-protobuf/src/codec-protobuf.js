//
// Copyright 2019 Wireline, Inc.
//

const { AnyType } = require('./schema.js');

// TODO(burdon): Does not support namespaces or multiple schema files.

/**
 * Encode / decode protocol buffers into hypercore blocks.
 *
 * TODO(burdon): What does this comment mean?
 * mapping {
 *   'Message1': 1,
 *   'Message2': 2
 * }
 */
function codecProtobuf(root) {
  return {
    encode: (obj) => {
      console.assert(typeof obj !== 'object');

      const { type, message } = obj;

      const Message = root[type];

      const value = Message.encode(message);

      return AnyType.encode({ type, value });
    },

    decode: (buffer, onlyMessage = true) => {
      const { type, value } = AnyType.decode(buffer);

      const Message = root[type];

      const message = Message.decode(value);

      // TODO(burdon): onlyMessage?
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

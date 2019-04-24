//
// Copyright 2019 Wireline, Inc.
//

const varint = require('varint');

/**
 * message = protocol-buffers instance
 *
 * mapping {
 *   'Message1': 1,
 *   'Message2': 2
 * }
 */
module.exports = function codecProtobuf(messages, mapping, opts = {}) {

  const mappingInverted = Object.keys(mapping).reduce((result, next) => {
    result[mapping[next]] = next;
    return result;
  }, {});

  return {
    encode: function encodeProtobuf(obj) {
      if (typeof obj !== 'object') {
        throw new Error('CodecProtobuf needs an object to encode.');
      }

      const { type, message } = obj;
      if (mapping[type] === undefined || messages[type] === undefined) {
        throw new Error(`CodecProtobuf encode mapping message for ${type} not found.`);
      }

      const typeBuffer = varint.encode(mapping[type], Buffer.alloc(opts.bufferSize || 1));
      const messageBuffer = messages[type].encode(message);
      return Buffer.concat([typeBuffer, messageBuffer], typeBuffer.length + messageBuffer.length);
    },

    decode: function decodeProtobuf(buffer, onlyMessage = true) {
      const type = mappingInverted[varint.decode(buffer, 0)];
      const message = buffer.slice(varint.decode.bytes);

      if (messages[type] === undefined) {
        throw new Error(`CodecProtobuf decode mapping message for ${type} not found.`);
      }

      if (onlyMessage) {
        return messages[type].decode(message);
      }

      return {
        type,
        message: messages[type].decode(message)
      };
    }
  };
};

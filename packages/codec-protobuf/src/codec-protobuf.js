//
// Copyright 2019 Wireline, Inc.
//

const protobuf = require('protobufjs');

protobuf.util.Buffer = Buffer;
protobuf.configure();

const AnyType = protobuf.Root.fromJSON(require('./schema.json')).lookupType('codecprotobuf.AnyType');

/**
 * encode / decode protobuffers
 *
 * mapping {
 *   'Message1': 1,
 *   'Message2': 2
 * }
 */
function codecProtobuf(root, { packageName } = {}) {
  return {
    encode: function encodeProtobuf(obj) {
      if (typeof obj !== 'object') {
        throw new Error('CodecProtobuf: The encode message needs to be an object { type, message }.');
      }

      const { type, message } = obj;

      const Message = root.lookupType(packageName ? `${packageName}.${type}` : type);

      const err = Message.verify(message);

      if (err) {
        throw new Error(`CodecProtobuf: ${err}`);
      }

      const value = Message.encode(message).finish();

      return Buffer.from(AnyType.encode({ type, value }).finish());
    },

    decode: function decodeProtobuf(buffer, onlyMessage = true) {
      const { type, value } = AnyType.toObject(AnyType.decode(buffer));

      const Message = root.lookupType(packageName ? `${packageName}.${type}` : type);

      const message = Message.decode(value);

      Object.keys(message).forEach((prop) => {
        if (message[prop] instanceof Uint8Array) {
          message[prop] = Buffer.from(message[prop]);
        }
      });

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

module.exports = { codecProtobuf, protobuf };

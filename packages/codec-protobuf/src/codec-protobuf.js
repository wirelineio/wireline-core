//
// Copyright 2019 Wireline, Inc.
//

const protobuf = require('protobufjs/light');

protobuf.util.Buffer = Buffer;
protobuf.configure();

const { Root } = protobuf;

const AnyType = Root.fromJSON(require('./schema.json')).lookupType('codecprotobuf.AnyType');

class Codec {
  constructor(options = {}) {
    const { verify = false } = options;

    this._verify = verify;

    this._root = new Root();
  }

  async loadFromJSON(schema) {
    const root = Root.fromJSON(schema);

    this._root.addJSON(root.nested);
  }

  getType(typeName) {
    const type = this._root.lookupType(typeName);

    if (!type) {
      throw new Error(`CodecProtobuf: Message type ${typeName} not found.`);
    }

    return type;
  }

  encode(obj) {
    if (typeof obj !== 'object' || obj.type === undefined || obj.message === undefined) {
      throw new Error('CodecProtobuf: The encode message needs to be an object { type, message }.');
    }

    const { type: typeName, message } = obj;

    const type = this.getType(typeName);

    if (this._verify) {
      const err = type.verify(message);

      if (err) {
        throw new Error(`CodecProtobuf: Verify error by ${err.message}`);
      }
    }

    const value = type.encode(message).finish();
    return AnyType.encode({ type: typeName, value }).finish();
  }

  decode(buffer) {
    const { message } = this.decodeWithType(buffer);

    return message;
  }

  decodeWithType(buffer) {
    const { type: typeName, value } = AnyType.toObject(AnyType.decode(buffer));

    const type = this.getType(typeName);

    const message = type.toObject(type.decode(value));

    return { type: typeName, message };
  }
}

module.exports = Codec;

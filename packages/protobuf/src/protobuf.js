//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Move to dxos.protobuf package.

import protobuf from 'protobufjs';

/**
 * Maintains a dictionary of types and supports encoding/decoding.
 *
 * ProtobufJS doesn't handle ANY (google.protobuf.Any) types. This class encodes/decodes JSON objects
 * that include fields with the ANY type.
 *
 * https://github.com/protobufjs/protobuf.js/issues/435
 *
 * JSON objects that correspond to ANY types must contain a `__type_url` property that corresponds to the
 * fully qualified type name.
 */
export class TypeFactory {

  _schemas = [];

  _typeDictionary = new Map();

  getType(name) {
    return this._typeDictionary.get(name);
  }

  /* eslint camelcase: "off" */
  /* eslint guard-for-in: "off" */

  parse(schema) {
    const root = protobuf.Root.fromJSON(schema);
    this._schemas.push(root);

    const traverse = (root, path = null) => {
      Object.keys(root.nested).forEach((key) => {
        const sub = root.nested[key];
        if (sub.nested) {
          traverse(sub, path ? `${path}.${key}` : key);
        } else {
          const type_url = `${path}.${sub.name}`;
          this._typeDictionary.set(type_url, root.lookupType(type_url));
        }
      });
    };

    traverse(root);

    return this;
  }

  // TODO(burdon): If type not found, then don't decode.
  // TODO(burdon): Encoding/decoding should be hierarchical.

  /**
   * Encode buffer.
   *
   * @param {string} type_url - Type name.
   * @param {Object} value - JSON object.
   * @return {Buffer}
   */
  encode(type_url, value) {
    const type = this.getType(type_url);
    const object = type.fromObject(value);

    for (const field in type.fields) {
      const { type: fieldType, repeated } = type.fields[field];
      if (fieldType === 'google.protobuf.Any') {
        const encode = (value) => {
          const { __type_url: type_url } = value;
          const valueType = this.getType(type_url);
          if (!valueType) {
            throw Error(`invalid type: ${type_url}`);
          }

          return {
            type_url,
            value: valueType.encode(valueType.fromObject(value)).finish()
          };
        };

        if (repeated) {
          object[field] = value[field].map(value => encode(value));
        } else {
          object[field] = encode(value[field]);
        }
      }
    }

    return type.encode(object).finish();
  }

  /**
   * Decode buffer.
   *
   * @param {string} type_url - Type name.
   * @param {Buffer} buffer - encoded bytes.
   * @return {Object} JSON object.
   */
  decode(type_url, buffer) {
    const type = this.getType(type_url);
    const object = type.toObject(type.decode(buffer));

    /* eslint guard-for-in: "off" */
    for (const field in type.fields) {
      const { type: fieldType, repeated } = type.fields[field];
      if (fieldType === 'google.protobuf.Any') {
        const decode = (any) => {
          const { type_url, value } = any;
          const valueType = this.getType(type_url);
          if (!valueType) {
            throw Error(`invalid type: ${type_url}`);
          }

          return Object.assign(valueType.toObject(valueType.decode(value)), { __type_url: type_url });
        };

        if (repeated) {
          object[field] = object[field].map(any => decode(any));
        } else {
          object[field] = decode(object[field]);
        }
      }
    }

    return object;
  }
}

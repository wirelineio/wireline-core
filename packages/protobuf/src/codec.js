//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Move to dxos.codec package.

import { Root, Type } from 'protobufjs/light';

/**
 * Maintains a dictionary of types and supports encoding/decoding of ANY types.
 *
 * ProtobufJS doesn't handle ANY (google.protobuf.Any) types (https://github.com/protobufjs/protobuf.js/issues/435).
 * This is likely since there is no unopinionated way to implement this feature.
 *
 * This module decodes types matching the `type_url` property that are present in the dictionary.
 * In order to provide a natural JSON data structure (i.e., not embed `{ type_url, value  }`) in the JSON object,
 * the type value is set in the `__type_url` property of the underlying object.
 *
 * Example:
 * ```
 * package testing;
 *
 * message Message {
 *   string bucket_id = 1;
 *   repeated google.protobuf.Any payload = 2;
 * }
 *
 * message Meta {
 *   string version = 1;
 * }
 *
 * {
 *   bucketId: 'bucket-1',
 *   payload: [{
 *     __type_url: 'testing.Meta',
 *     version: '0.0.1'
 *   }]
 * }
 * ```
 */
export class Codec {

  /* eslint camelcase: "off" */
  /* eslint guard-for-in: "off" */

  /**
   * Parser.
   * https://github.com/protobufjs/protobuf.js/blob/master/src/root.js
   * @type {Object}
   * @property lookup
   */
  _root = new Root();

  /**
   * @param {string} type - Fully qualified type name.
   * @return {Type} The type object or null if not found.
   */
  getType(type) {
    // TODO(burdon): Map WRN to type_url.
    return this._root.lookup(type, [Type]);
  }

  /**
   * Add the given JSON schema to the type dictionary.
   * @param {string} json - Compiled JSON schema.
   * @return {Codec}
   */
  addJson(json) {
    Root.fromJSON(json, this._root);
    return this;
  }

  // TODO(burdon): Encoding/decoding should be hierarchical (not just for ANY).

  /**
   * Encode buffer.
   *
   * @param {Object} value - JSON object.
   * @param {string} type_url - Type name.
   * @return {Buffer}
   */
  encode(value, type_url) {
    const type = this.getType(type_url);
    const object = type.fromObject(value);

    for (const field in type.fields) {
      const { type: fieldType, repeated } = type.fields[field];

      if (fieldType === 'google.protobuf.Any') {
        const encodeAny = (any) => {
          const { __type_url: type_url } = any;
          return {
            type_url,
            value: this.encode(any, type_url)
          };
        };

        if (repeated) {
          object[field] = value[field].map(value => encodeAny(value));
        } else {
          object[field] = encodeAny(value[field]);
        }
      }
    }

    return type.encode(object).finish();
  }

  /**
   * Decode buffer.
   *
   * @param {Buffer} buffer - encoded bytes.
   * @param {string} type_url - Type name.
   * @return {Object} JSON object.
   */
  decode(buffer, type_url) {
    const type = this.getType(type_url);
    const object = type.toObject(type.decode(buffer));

    /* eslint guard-for-in: "off" */
    for (const field in type.fields) {
      const { type: fieldType, repeated } = type.fields[field];

      if (fieldType === 'google.protobuf.Any') {
        const decodeAny = (any) => {
          const { type_url, value } = any;
          return Object.assign(this.decode(value, type_url), {
            __type_url: type_url
          });
        };

        if (repeated) {
          object[field] = object[field].map(any => decodeAny(any));
        } else {
          object[field] = decodeAny(object[field]);
        }
      }
    }

    return object;
  }
}

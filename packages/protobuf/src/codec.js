//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Move to dxos.codec package.

import { Root, Type } from 'protobufjs/light';
import defaultsDeep from 'lodash.defaultsdeep';

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

  // JSON schema.
  _json = {};

  /**
   * Parser.
   * https://github.com/protobufjs/protobuf.js/blob/master/src/root.js
   * @type {Object}
   * @property lookup
   */
  _root = null;

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
    defaultsDeep(this._json, json);
    return this;
  }

  /**
   * Builds the dictionary from the cumulatively added JSON files.
   * @return {Codec}
   */
  build() {
    this._root = Root.fromJSON(this._json);
    return this;
  }

  // TODO(burdon): Encoding/decoding should be hierarchical (not just for ANY).

  /**
   * Encode buffer.
   *
   * @param {Object} value - JSON object.
   * @return {Buffer}
   */
  encode(value) {
    const { __type_url: type_url } = value;
    if (!type_url) {
      throw new Error('Missing __type_url attribute');
    }

    const type = this.getType(type_url);
    if (!type) {
      throw new Error(`Type not found: ${type_url}`);
    }

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

    // TODO(burdon): Should each field be individually encoded?
    return type.encode(object).finish();
  }

  /**
   * Decode buffer.
   *
   * @param {Buffer} buffer - encoded bytes.
   * @param {string} type_url - Type name.
   * @param {Object} options
   * @return {Object} JSON object.
   */
  decode(buffer, type_url, options = { recursive: true }) {
    const type = this.getType(type_url);
    if (!type) {
      throw new Error(`Type not found: ${type_url}`);
    }

    const object = Object.assign(type.toObject(type.decode(buffer)), {
      __type_url: type_url
    });

    return this.decodeObject(object, options);
  }

  /**
   * Decode partially decoded object.
   *
   * @param object
   * @param {Object} options
   */
  decodeObject(object, options = { recursive: true }) {
    const { __type_url: type_url } = object;
    if (!type_url) {
      throw new Error('Missing __type_url attribute');
    }

    // TODO(burdon): Warn if type not found.
    const type = this.getType(object.__type_url);
    if (!type) {
      return object;
    }

    /* eslint guard-for-in: "off" */
    for (const field in type.fields) {
      const { type: fieldType, repeated } = type.fields[field];

      if (fieldType === 'google.protobuf.Any' && options.recursive) {
        const decodeAny = (any) => {
          const { type_url, value: buffer } = any;
          return Object.assign(this.decode(buffer, type_url, options), {
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

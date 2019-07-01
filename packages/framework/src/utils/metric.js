//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Factor out.

/**
 * Represents a metric.
 */
class Metric {

  /**
   * @param {*} value
   * @param {function} [toString] Optional function to provide short string value.
   */
  constructor(value, toString) {
    this._value = value;
    this._toString = toString;
  }

  toString() {
    return this._toString ? String(this._toString(this._value)) : String(this._value);
  }

  get value() {
    return this._value;
  }
}

module.exports = Metric;

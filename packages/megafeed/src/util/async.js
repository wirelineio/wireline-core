//
// Copyright 2019 Wireline, Inc.
//

/**
 * Enables a promise to be resolved from a different location.
 */
export class Latch {
  _resolve;
  _reject;

  reset() {
    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  resolve(...args) {
    this._resolve(...args);
    this._resolve = null;
    this._reject = null;
  }

  reject(...args) {
    this._reject(...args);
    this._resolve = null;
    this._reject = null;
  }
}

export const sleep = async (t = 10) => {
  return await new Promise((resolve) => {
    setTimeout(() => { resolve(); }, t);
  });
};

// TODO(burdon): Error handling.
export const waitForAsync = (callback) => async function() {
  return await callback(...arguments);
};

export const latch = (n, callback) => () => { if (--n === 0) callback(n) };

//
// Copyright 2019 Wireline, Inc.
//

const mutexify = require('mutexify');

class Locker {
  constructor() {
    this._lock = mutexify();
  }

  lock() {
    return new Promise((resolve) => {
      this._lock((cbRelease) => {
        const release = () => new Promise(resolve => cbRelease(resolve));
        resolve(release);
      });
    });
  }
}

module.exports = Locker;

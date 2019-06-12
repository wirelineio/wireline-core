//
// Copyright 2019 Wireline, Inc.
//

const mutexify = require('mutexify');

class Locker {

  constructor() {
    this._locks = new Map();
  }

  // TODO(burdon): Why lock and pLock?

  lock(resource, cb) {
    if (typeof resource !== 'string') {
      cb = resource;
      resource = 'global';
    }

    let lock = this._locks.get(resource);

    if (!lock) {
      lock = mutexify();
      this._locks.set(resource, lock);
    }

    return lock(cb);
  }

  pLock(resource) {
    return new Promise(resolve => {
      this.lock(resource, release => {
        const pRelease = () => new Promise(resolve => release(resolve));
        resolve(pRelease);
      });
    });
  }
}

module.exports = Locker;

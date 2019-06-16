//
// Copyright 2019 Wireline, Inc.
//

const mutexify = require('mutexify');

/**
 * Locker implements a semaphore.
 */
// TODO(burdon): Remove. Why is this needed (it's dangerous).
class Locker {

  constructor() {
    this._locks = new Map();
  }

  lock(resource, cb) {
    // TODO(burdon): DO NOT USE 1990s STYLE MONKEY PARAMS. Strict type checking.
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

  // TODO(burdon): DO NOT IMPLEMENT MULTIPLE APIS FOR DIFFERENT ASYNC SYNTAXES.
  pLock(resource) {
    return new Promise((outerResolve) => {
      this.lock(resource, (release) => {
        outerResolve(() => new Promise(resolve => release(resolve)));
      });
    });
  }
}

module.exports = Locker;

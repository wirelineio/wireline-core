//
// Copyright 2019 Wireline, Inc.
//

const kappa = require('kappa-core');

/**
 * Creates a kappa instance with an multifeed index wrapper for Megafeed.
 *
 * @param mega
 * @param adapter
 * @return {Kappa}
 */
exports.createKappa = (mega, adapter) => {

  const instance = kappa(null, {

    // https://github.com/kappa-db/multifeed-index
    multifeed: {
      // TODO(burdon): Split event bubbling.
      on: (...args) => mega._mega.on(...args),
      ready: (...args) => mega._mega.ready(...args),
      feeds: (...args) => mega._mega.feeds(...args),
    }
  });

  // TODO(burdon): Temporary wrapper for views (kappa => dsuite)
  instance.dsuite = adapter;

  return instance;
};

class Adapter {

  constructor(dsuite) {
    this._dsuite = dsuite;

    const methods = [
      'on',                 // connectionStatusChange => connection
      'removeListener',     // cleanupSubscription => connection
    ];

    methods.forEach((method) => { this[method] = this._dsuite[method].bind(this._dsuite); });
  }

  // connectionStatusChange => swarm.signal
  get swarm() {
    return this._dsuite.swarm;
  }
}

exports.createKappaViewAdapter = dsuite => new Adapter(dsuite);

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

  // TODO(burdon): Pass additional properties to KappaLink instead.
  instance.dsuite = adapter;

  return instance;
};

class Adapter {

  constructor(framework) {
    this._frameowrk = framework;

    const methods = [
      // TODO(burdon): Events
      'on',                     // connectionStatusChange => connection
      'removeListener',         // cleanupSubscription => connection
    ];

    methods.forEach((method) => { this[method] = this._frameowrk[method].bind(this._frameowrk); });
  }

  // connectionStatusChange => swarm.signal
  get swarm() {
    return this._frameowrk.swarm;
  }
}

exports.createKappaViewAdapter = framework => new Adapter(framework);

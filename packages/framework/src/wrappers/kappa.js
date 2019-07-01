//
// Copyright 2019 Wireline, Inc.
//

const kappa = require('kappa-core');

/**
 * Creates a kappa instance with an multifeed index wrapper for Megafeed.
 *
 * @param mega
 * @return {Kappa}
 */
exports.createKappa = (mega) => {
  return kappa(null, {

    // https://github.com/kappa-db/multifeed-index
    multifeed: {
      // TODO(burdon): Event bubbling?
      on: (...args) => mega._mega.on(...args),
      ready: (...args) => mega._mega.ready(...args),
      feeds: (...args) => mega._mega.feeds(...args),
      destroy: (...args) => mega._mega.destroy(...args)
    }
  });
};

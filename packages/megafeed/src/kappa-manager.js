//
// Copyright 2019 Wireline, Inc.
//

import kappa from 'kappa-core';

import { MultifeedAdapter } from './multifeed-adapter';

/**
 * Kappa factory.
 */
export class KappaManager {

  /**
   * @type {Map<{string}, {Kappa}>}
   */
  _kappaList = new Map();

  /**
   * @constructor
   * @param {Megafeed} megafeed
   */
  constructor(megafeed) {
    console.assert(megafeed);

    this._megafeed = megafeed;
  }

  /**
   * Creates a kappa instance bound to the given topic.
   * @param topic
   * @returns {Promise<Kappa>}
   */
  getOrCreateKappa(topic) {
    console.assert(topic);

    // TODO(ashwin): How is kappa storage configured?
    const kappaInstance = this._kappaList.get(topic) || kappa(null, {
      multifeed: new MultifeedAdapter(this._megafeed, topic).initialize()
    });

    this._kappaList.set(topic, kappaInstance);

    return kappaInstance;
  }
}

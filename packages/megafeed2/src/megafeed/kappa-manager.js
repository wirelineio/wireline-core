//
// Copyright 2019 Wireline, Inc.
//

import kappa from 'kappa-core';
import pify from 'pify';

import { createMultifeed } from './multifeed-adapter-topic';

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
  async getOrCreateKappa(topic) {
    console.assert(topic);

    // TODO(ashwin): How is kappa storage configured?
    const kappaInstance = this._kappaList.get(topic) || kappa(null, {
      multifeed: await createMultifeed(this._megafeed, topic)
    });

    this._kappaList.set(topic, kappaInstance);

    await pify(kappaInstance.ready.bind(kappaInstance))();

    return kappaInstance;
  }
}

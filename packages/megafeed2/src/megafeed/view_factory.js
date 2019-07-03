//
// Copyright 2019 Wireline, Inc.
//

import kappa from 'kappa-core';

import { createMultifeedAdapter } from './feedmap';

/**
 * View factory.
 */
export class ViewFactory {

  /**
   * @type {Map<{string}, {Kappa}>}
   */
  _views = new Map();

  /**
   * @constructor
   * @param storage
   * @param feedMap
   */
  constructor(storage, feedMap) {
    console.assert(storage);
    console.assert(feedMap);

    this._storage = storage;
    this._feedMap = feedMap;
  }

  /**
   * Creates a kappa instance bound to the given topic.
   * @param viewId
   * @param topic
   * @returns {Promise<Kappa>}
   */
  async getOrCreate(viewId, topic) {
    console.assert(viewId);
    console.assert(topic);

    // TODO(ashwin): How is kappa storage configured?
    let kappaInstance = this._views.get(viewId) || kappa(this._storage, {
      multifeed: await createMultifeedAdapter(this._feedMap, topic)
    });

    this._views.set(viewId, kappaInstance);

    return kappaInstance;
  }
}

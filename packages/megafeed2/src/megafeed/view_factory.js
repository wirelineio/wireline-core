//
// Copyright 2019 Wireline, Inc.
//

import kappa from 'kappa-core';

import { createMultifeedAdapter } from './multifeed_adapter';

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
   * @param feedStore
   */
  constructor(storage, feedStore) {
    console.assert(storage);
    console.assert(feedStore);

    this._storage = storage;
    this._feedStore = feedStore;
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
      multifeed: await createMultifeedAdapter(this._feedStore, topic)
    });

    this._views.set(viewId, kappaInstance);

    return kappaInstance;
  }
}

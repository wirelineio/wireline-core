//
// Copyright 2019 Wireline, Inc.
//

// import debug from 'debug';

// const log = debug('mixer');

/**
 * De-multiplexes messages into buckets.
 */
export class Mixer {

  _subscriptions = new Set();

  /**
   * @param {FeedStore} feedStore
   */
  constructor(feedStore) {
    console.assert(feedStore);
  }

  subscribe(query, callback) {
    const subscription = { query, callback };
    this._subscriptions.add(subscription);

    return {
      query,
      close: () => this._subscriptions.delete(subscription)
    };
  }
}

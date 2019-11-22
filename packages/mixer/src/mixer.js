//
// Copyright 2019 Wireline, Inc.
//

export const feedKey = (peer, party) => `/${peer}/${party}`;

/**
 * De-multiplexes messages into buckets.
 */
export class Mixer {

  /**
   * @param {FeedStore} feedStore
   */
  constructor(feedStore) {
    console.assert(feedStore);
    this._feedStore = feedStore;
  }

  /**
   * @param feedKey
   */
  createKeyStream(feedKey) {
    const pattern = new RegExp(feedKey);

    const filter = descriptor => !!pattern.exec(descriptor.path);

    // https://github.com/mafintosh/hypercore#var-stream--feedcreatereadstreamoptions
    const options = {
      live: true
    };

    // TODO(burdon): Filter bucket.
    return this._feedStore.createReadStreamByFilter(filter, options);
  }
}

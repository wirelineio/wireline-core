//
// Copyright 2019 Wireline, Inc.
//

import through from 'through2';

export const feedKey = (peer, party) => `${peer}/${party}`;

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
   * Returns a readable stream with message for the given feed and message filters.
   *
   * @param {string} feedKey - Feed path regular expression.
   * @param {Object} [filter] - message filter.
   * @return {Readable} message stream.
   */
  createKeyStream(feedKey, filter = {}) {
    const pattern = new RegExp(feedKey);
    const feedFilter = descriptor => !!pattern.exec(descriptor.path);

    // https://github.com/mafintosh/hypercore#var-stream--feedcreatereadstreamoptions
    const options = {
      live: true
    };

    const reader = this._feedStore.createReadStreamByFilter(feedFilter, options);
    if (!filter) {
      return reader;
    }

    const writer = through.obj(function process(chunk, encoding, next) {
      this.push(JSON.stringify(chunk));
      next();
    });

    // TODO(burdon): Implement query matcher.
    const matcher = ({ bucketId }) => bucketId === filter.bucketId;

    // TODO(burdon): Is this the right way to filter a stream (e.g., https://github.com/brycebaril/through2-filter)?
    reader.on('data', (message) => {
      if (matcher(message)) {
        writer.push(message);
      }
    });

    return writer;
  }
}

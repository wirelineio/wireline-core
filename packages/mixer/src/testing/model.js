//
// Copyright 2019 Wireline, Inc.
//

/**
 * Test CRDT.
 */
export class TestModel {

  constructor(codec, bucket) {
    this._codec = codec;
    this._bucket = bucket;
  }

  /**
   * Write messages to feed.
   * @param mutations
   * @return {Promise<void>}
   */
  async appendMessages(mutations) {
    const messages = mutations.map(mutation => ({
      bucketId: this._bucket,
      payload: mutation
    }));

    for (const message of messages) {
      // TODO(burdon): Append should handle encoding.
      await this._append(this._codec.encode(message, 'dxos.mixer.Message'));
    }
  }

  /**
   *
   * @param messages
   * @return {Promise<void>}
   */
  async processMessages(messages) {
    // TODO(burdon): Middleware?
    // TODO(burdon): Outer should already have been unwrapped.
    const mutations = messages.map(message => this._codec.decode(message, 'dxos.mixer.Message'));

    // TODO(burdon): Build state.
    console.log(mutations);
  }
}
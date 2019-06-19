//
// Copyright 2019 Wireline, Inc.
//

/**
 * Persistent feed manager.
 */
export default class FeedMap extends EventEmitter {

  async init() {}

  // API

  async getFeeds(spec) {}

  async addFeeds(feeds) {}

  async deleteFeeds(feeds) {}

  // Implementation

  async _loadFeeds(feeds) {}

  async _saveFeeds(feeds) {}
}

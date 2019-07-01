//
// Copyright 2019 Wireline, Inc.
//

const { Megafeed } = require('@wirelineio/megafeed');

/**
 * Wrapper class.
 */
class MegaWrapper {

  constructor(storage, publicKey, secretKey, feeds) {
    this._mega = new Megafeed(storage, publicKey, {
      valueEncoding: 'json',
      secretKey,
      feeds
    });

    // TODO(burdon): Evolve API for gravity?

    const methods = [
      'on',             // DSuite

      // Kappa/Multifeed (see createMultifeedWrapper below).
      // 'ready',          // Kappa Indexer
      // 'feeds',          // Multifeed Index? levelup => _logs.feeds

      // FeedMap
      'feed',           // DSuite.initialize => swarm.js
      'addFeed',        // DSuite.initialize
      'loadFeeds',      // DSuite.initialize
      'feedByDK',       // PartyManager.getPartyKeyFromFeedKey
      'replicate',      // DiscoverySwarmWebrtc.stream
      'setRules',       // DSuite.initialize

      // Party
      // TODO(burdon): Remove.
      'addParty',       // PartyManager.connectToParty
      'party',          // PartyManager.setParty
    ];

    methods.forEach((method) => { this[method] = this._mega[method].bind(this._mega); });
  }

  // DSuite.initialize => swarm.js
  get id() {
    return this._mega.id;
  }
}

/**
 * Creates a Megafeed wrapper to isolate dependencies.
 *
 * @param storage
 * @param publicKey
 * @param secretKey
 * @param feeds
 * @return {MegaWrapper}
 */
exports.createMega = (storage, publicKey, secretKey, feeds) => {
  return new MegaWrapper(storage, publicKey, secretKey, feeds);
};

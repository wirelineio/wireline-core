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
      'on',             // Framework

      // Kappa/Multifeed (see createMultifeedWrapper below).
      // 'ready',          // Kappa Indexer
      // 'feeds',          // Multifeed Index? levelup => _logs.feeds

      // FeedMap
      'feed',           // Framework.initialize => swarm.js
      'addFeed',        // Framework.initialize
      'loadFeeds',      // Framework.initialize
      'feedByDK',       // PartyManager.getPartyKeyFromFeedKey
      'replicate',      // DiscoverySwarmWebrtc.stream

      // Party
      'setRules',       // Framework.initialize
      'addParty',       // PartyManager.connectToParty
      'party',          // PartyManager.setParty
      'loadParties',    // botkit-core Factory.createBot
    ];

    methods.forEach((method) => { this[method] = this._mega[method].bind(this._mega); });
  }

  // Framework.initialize => swarm.js
  get id() {
    return this._mega.id;
  }

  get key() {
    return this._mega.key;
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

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
      'feed',           // Framework.initialize => swarm.js, PartyManager.getLocalPartyFeed
      'addFeed',        // Framework.initialize, PartyManager.createLocalPartyFeed
      'loadFeeds',      // Framework.initialize, PartyManager.setParty
      'feedByDK',       // PartyManager.getPartyKeyFromFeedKey
      'replicate',      // DiscoverySwarmWebrtc.stream

      // Party
      // 'setRules',       // Framework.initialize
      // 'addParty',       // PartyManager.connectToParty
      // 'party',          // PartyManager.setParty
      // 'loadParties',    // botkit-core Factory.createBot
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

  // Get access to partyMap impl for PartyManager.
  // TODO(elmasse): Remove when megafeed2 is ready.
  get partyMap() {
    return this._mega._parties;
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

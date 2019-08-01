//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');

const { getDiscoveryKey, keyToHex } = require('@wirelineio/utils');

/**
 * Manages party-related state.
 */
class PartyManager extends EventEmitter {

  constructor(currentPartyKey) {
    super();

    this._parties = new Map();
    this._currentPartyKey = currentPartyKey;
    this.setParty(currentPartyKey);
  }

  // TODO(burdon): Currently only supports one party at a time?
  get currentPartyKey() {
    return this._currentPartyKey;
  }

  findPartyByDiscovery(dk) {
    return this._parties.get(keyToHex(dk));
  }

  setParty(partyKey) {
    const dk = getDiscoveryKey(partyKey);
    this._parties.set(keyToHex(dk), partyKey);
    return { key: partyKey, dk };
  }
}

module.exports = PartyManager;

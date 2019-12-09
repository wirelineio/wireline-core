//
// Copyright 2019 Wireline, Inc.
//

const { Party } = require("@wirelineio/credentials");

const { EventEmitter } = require('events');

const { getDiscoveryKey, keyToHex } = require('@wirelineio/utils');

/**
 * Manages party-related state.
 */
class PartyManager extends EventEmitter {
  constructor(currentPartyKey) {
    super();
    this._currentParty = null;
    if (currentPartyKey) {
      this.setParty(currentPartyKey);
    }
  }

  get currentParty() {
    return this._currentParty;
  }

  get parties() {
    return [this._currentParty];
  }

  findPartyByDiscovery(dk) {
    if (dk && dk.equals(this.currentParty.discoveryKey)) {
      return this.currentParty;
    }
    return null;
  }

  setParty(partyOrKey) {
    let party = Buffer.isBuffer(partyOrKey) ? new Party(partyOrKey) : partyOrKey;

    if (!this._currentParty || !this.currentParty.publicKey.equals(party.publicKey)) {
      this._currentParty = party;
    }

    return { key: this._currentParty.publicKey, dk: this._currentParty.discoveryKey, party: this._currentParty };
  }
}

module.exports = PartyManager;

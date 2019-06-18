//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const assert = require('assert');
const crypto = require('crypto');

const mm = require('micromatch');
const protocol = require('hypercore-protocol');

const { keyToHex } = require('@wirelineio/utils');

const createStorage = require('./storage');
const Rules = require('./rules');
const Party = require('./party');
const codec = require('./codec');

class PartyMap extends EventEmitter {
  static get codec() {
    return codec;
  }

  static encodeParty(message) {
    return codec.encode({ type: 'Party', message: message.serialize() });
  }

  /**
   * 
   * @param {Object} opts 
   * @param {} opts.id
   * @param {} opts.repository
   * @param {} opts.ready
   * @param {} opts.findFeed
   */
  constructor({ id, repository, ready, findFeed }) {
    super();

    this.id = id || crypto.randomBytes(32);
    
    this._ready = ready;
    this._findFeed = findFeed;
    this._repository = repository;

    this._rules = new Map();
    this._parties = new Map();
  }

  rules() {
    return Array.from(this._rules.values());
  }

  list() {
    return Array.from(this._parties.values());
  }

  setRules(rules) {
    const newRules = rules;

    assert(typeof newRules.name === 'string' && newRules.name.length > 0, 'Name rule string is required.');

    newRules.ready = newRules.ready || this._megaReady;
    newRules.findFeed = newRules.findFeed || this._megaFindFeed;

    this._rules.set(newRules.name, new Rules(newRules));
  }

  async addParty({ name, key, secretKey, rules, metadata }) {
    let newRules = rules;

    if (typeof newRules === 'string') {
      if (!this._rules.has(newRules)) {
        throw new Error(`There is not rules for "${newRules}"`);
      }

      newRules = this._rules.get(newRules);
    }

    const party = new Party({
      id: this.id,
      name,
      key,
      secretKey,
      metadata,
      rules: newRules
    });

    try {
      await this._repository.put(party.name, party, { encode: PartyMap.encodeParty });

      const discoveryKey = keyToHex(party.discoveryKey);

      this._parties.set(discoveryKey, party);

      this.emit('party', party);

      return party;
    } catch (err) {
      throw err;
    }
  }

  party(key) {
    const hexKey = keyToHex(key);

    let party = this._parties.get(hexKey);

    if (!party) {
      party = this.list().find(p => keyToHex(p.key) === hexKey || p.name === hexKey);
    }

    if (party && party.rules) {
      return party;
    }

    return null;
  }

  async loadParties(userPattern) {
    let pattern = userPattern;

    if (Array.isArray(pattern)) {
      pattern = pattern.filter(Boolean).map(value => keyToHex(value));
    } else {
      pattern = keyToHex(pattern);
    }

    const partiesLoaded = this.list().map(party => keyToHex(party.key));

    const partiesPersisted = (await this.storage.getPartyList({ codec }))
      .filter(party => !partiesLoaded.includes(keyToHex(party.key)));

    const partiesToLoad = partiesPersisted.filter((party) => {
      const list = [party.name, keyToHex(party.key)].filter(Boolean);

      const matches = mm(list, pattern);

      return matches.length > 0;
    });

    try {
      return await Promise.all(partiesToLoad.map(party => this.addParty(party)));
    } catch (err) {
      throw err;
    }
  }

  replicate({ key: partyDiscoveryKey, ...options } = {}) {
    let party;
    let stream;

    if (partyDiscoveryKey) {
      party = this.party(partyDiscoveryKey);

      if (party) {
        return party.replicate(options);
      }

      stream = protocol(options);
      stream.destroy();
      return stream;
    }

    stream = protocol(options);

    stream.on('feed', (discoveryKey) => {
      if (stream.destroyed) return null;

      if (!party) {
        party = this.party(discoveryKey);

        if (party) {
          return party.replicate({ ...options, stream });
        }
      }
    });

    return stream;
  }
}

module.exports = PartyMap;

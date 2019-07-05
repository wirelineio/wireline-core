//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const assert = require('assert');

const mm = require('micromatch');
const protocol = require('hypercore-protocol');

const { keyToHex, MessageStore } = require('@wirelineio/utils');

const Rule = require('./rule');
const Party = require('./party');
const codec = require('./codec');

const STORE_NAMESPACE = 'parties';

class PartyMap extends EventEmitter {

  /**
   *
   * @param {Hypertrie} db
   * @param {Object} opts
   * @param {Function} opts.ready
   * @param {Function} opts.findFeed
   */
  constructor(db, options = {}) {
    super();

    this.id = db.id;

    this._messageStore = new MessageStore(
      db,
      {
        encode: message => codec.encode({ type: 'Party', message: message.serialize() }),
        decode: codec.decode.bind(codec)
      }
    );

    const { ready, findFeed } = options;

    this._ready = ready;
    this._findFeed = findFeed;

    this._rules = new Map();
    this._parties = new Map();
  }

  rules() {
    return Array.from(this._rules.values());
  }

  list() {
    return Array.from(this._parties.values());
  }

  findFeed(...args) {
    return this._findFeed(...args);
  }

  setRules(options = {}) {
    const { name, ready = this._ready, findFeed = this._findFeed, ...opts } = options;

    assert(typeof name === 'string' && name.length > 0, 'setRule: "name" is required.');

    this._rules.set(name, new Rule({
      ...opts,
      name,
      ready,
      findFeed
    }));
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
      await this._messageStore.put(`${STORE_NAMESPACE}/${party.name}`, party);

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

    const partiesPersisted = (await this._messageStore.list(STORE_NAMESPACE))
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

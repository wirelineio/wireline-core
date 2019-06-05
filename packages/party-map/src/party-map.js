//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const assert = require('assert');
const crypto = require('crypto');

const mm = require('micromatch');
const protocol = require('hypercore-protocol');
const codecProtobuf = require('@wirelineio/codec-protobuf');

const createStorage = require('./storage');
const Rules = require('./rules');
const Party = require('./party');

// utils
const { keyToHex } = require('./utils/keys');

const schema = require('./schema.js');

const codec = codecProtobuf(schema);

class PartyMap extends EventEmitter {
  static get codec() {
    return codec;
  }

  static encodeParty(message) {
    return codec.encode({ type: 'Party', message: message.serialize() });
  }

  constructor(handler) {
    super();

    this.id = handler.id || crypto.randomBytes(32);

    if (typeof handler === 'object' && handler.constructor.name === 'Megafeed') {
      this._handler = {
        storage: createStorage(handler._root),
        findFeed: handler.feedByDK.bind(handler)
      };
    } else {
      this._handler = handler;
    }

    this._rules = new Map();

    this._parties = new Map();
  }

  rules() {
    return Array.from(this._rules.values());
  }

  list() {
    return Array.from(this._parties.values());
  }

  setRules(handler) {
    assert(typeof handler.name === 'string' && handler.name.length > 0, 'Name rule string is required.');

    this._rules.set(handler.name, new Rules(handler));
  }

  async setParty({ name, key, secretKey, rules, metadata }) {
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
      rules: newRules,
      findFeed: this._handler.findFeed.bind(this._handler)
    });

    try {
      await this._handler.storage.putParty(party, { encode: PartyMap.encodeParty });

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

    const partiesPersisted = (await this._handler.storage.getPartyList({ codec }))
      .map((msg) => {
        if (Buffer.isBuffer(msg)) {
          return PartyMap.decode(msg).value;
        }

        return msg.value;
      })
      .filter(party => !partiesLoaded.includes(keyToHex(party.key)));

    const partiesToLoad = partiesPersisted.filter((party) => {
      const list = [party.name, keyToHex(party.key)].filter(Boolean);

      const matches = mm(list, pattern);

      return matches.length > 0;
    });

    try {
      return await Promise.all(partiesToLoad.map(party => this.setParty(party)));
    } catch (err) {
      throw err;
    }
  }

  replicate({ partyDiscoveryKey, ...options } = {}) {
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

//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const assert = require('assert');
const crypto = require('crypto');

const mm = require('micromatch');
const eos = require('end-of-stream');
const debug = require('debug')('megafeed:party-map');

const schema = require('./schema');

// utils
const codecProtobuf = require('./utils/codec-protobuf');
const { callbackPromise, resolveCallback } = require('./utils/promise-help');
const { keyToHex, keyToBuffer, getDiscoveryKey } = require('./utils/keys');

const pNoop = () => Promise.resolve();

class Peer extends EventEmitter {
  constructor({
    partyMap, party, stream, opts,
  }) {
    super();

    // we need to have access to the entire list of parties
    this.partyMap = partyMap;

    // party + party.rules
    this.party = party;

    // connection
    this.stream = stream;

    // root feed (which we used to encrypt the hypercore-protocol)
    const [rootFeed] = stream.feeds;
    this.feed = rootFeed;

    // options for the replicate
    this.opts = opts;

    // we track each party message extension using transaction [ [id, promise] ]
    this.transactions = new Map();

    // we track each feed that we are replicating
    this.replicating = stream.feeds.map(feed => keyToHex(feed.key));

    this._initializePartyExtension();
  }

  get peerId() {
    return this.stream.remoteId;
  }

  get partyKey() {
    return this.party.key;
  }

  guestFeedKeys() {
    return this.partyMap.guestFeedKeys(this.party.key);
  }

  replicate(feed, opts = {}) {
    const key = feed.key.toString('hex');

    if (this.replicating.includes(key)) {
      return false;
    }

    debug('replicate', { peerId: this.peerId.toString('hex'), replicate: feed.key.toString('hex') });

    feed.replicate(Object.assign({}, this.opts, opts));

    this.replicating.push(key);

    return true;
  }

  introduceFeeds(message, cb = callbackPromise()) {
    const type = 'IntroduceFeeds';

    const transaction = this._emitTransaction({
      type,
      data: Peer._parseTransactionMessages(type, message),
    });

    resolveCallback(transaction, cb);

    return cb.promise;
  }

  sendMessage({ id, subject, data }) {
    let formatData = data;

    if (!Buffer.isBuffer(formatData)) {
      if (typeof formatData === 'object') {
        formatData = JSON.parse(formatData);
      }

      formatData = Buffer.from(formatData);
    }

    this.feed.extension('party', Peer._codec.encode({
      type: 'EphemeralMessage',
      message: {
        id: id || crypto.randomBytes(12).toString('hex'),
        subject,
        data: formatData,
      },
    }));
  }

  _initializePartyExtension() {
    const { rules } = this.party;

    this.feed.on('extension', (extensionType, buffer) => {
      if (extensionType !== 'party') return;

      const { type, message } = Peer._codec.decode(buffer, false);

      switch (type) {
        case 'IntroduceFeeds':
          resolveCallback(this._onTransaction({ type, message, method: 'remoteIntroduceFeeds' }), (err) => {
            debug(`<-- ${type}`, err);
          });
          break;
        case 'EphemeralMessage':
          if (rules.remoteMessage) {
            rules.remoteMessage({ peer: this, message });
          }
          break;
        default:
          break;
      }
    });
  }

  async _emitTransaction({ type, data }) {
    const id = crypto.randomBytes(12).toString('hex');

    return new Promise((resolve) => {
      this.transactions.set(id, resolve);

      const message = Object.assign({ id }, data);

      debug(`--> ${type}`, message);

      this.feed.extension('party', Peer._codec.encode({
        type,
        message,
      }));
    });
  }

  async _onTransaction({ type, message, method }) {
    const resolve = this.transactions.get(message.id);

    // answer
    if (resolve) {
      this.transactions.delete(message.id);
      debug(`<-- ${type}`, message);
      return resolve(message);
    }

    const data = await this.party.rules[method]({ peer: this, message });

    const returnMessage = Peer._parseTransactionMessages(
      type,
      Object.assign({ id: message.id }, data || {}),
    );

    this.feed.extension('party', Peer._codec.encode({
      type,
      message: returnMessage,
    }));

    return null;
  }

  static _parseTransactionMessages(type, message = {}) {
    switch (type) {
      case 'IntroduceFeeds': return Object.assign({}, message, {
        keys: message.keys ? message.keys.map(key => keyToBuffer(key)) : [],
      });
      default: return {};
    }
  }
}

class PartyMap extends EventEmitter {
  constructor({ root }) {
    super();

    this._root = root;

    this._rules = new Map();

    this._parties = new Map();

    this._peers = new Set();
  }

  rules() {
    return Array.from(this._rules.values());
  }

  list() {
    return Array.from(this._parties.values());
  }

  peers(partyKey) {
    const bufferPartyKey = keyToBuffer(partyKey);
    const peers = Array.from(this._peers.values());

    if (!bufferPartyKey) {
      return peers;
    }

    return peers.filter(peer => Buffer.compare(peer.party.key, bufferPartyKey) === 0);
  }

  // Feed keys in the party.
  guestFeedKeys(partyKey) {
    const result = new Set();
    const party = this.party(partyKey);


    this.peers(partyKey).forEach((peer) => {
      peer.replicating.forEach((key) => {
        if (!party.isFeed && key === peer.replicating[0]) {
          // If the party is not a feed we don't want to add the initial key as a feed.
          return;
        }

        result.add(key);
      });
    });

    return Array.from(result.values()).map(key => keyToBuffer(key));
  }

  addPeer({
    party, stream, feed, options,
  }) {
    const opts = Object.assign({}, options, { stream });

    if (stream.destroyed) return null;

    const peer = new Peer({
      partyMap: this, party, stream, feed, opts,
    });

    this._peers.add(peer);

    debug('peer-add', peer);
    this.emit('peer-add', peer);

    eos(stream, (err) => {
      peer.emit('destroy', err, peer);

      debug('peer-destroy', err);

      this._peers.delete(peer);

      debug('peer-remove', peer);
      this.emit('peer-remove', peer);
    });

    return peer;
  }

  setRules(newRules) {
    const rules = Object.assign({}, newRules);

    assert(typeof rules.name === 'string' && rules.name.length > 0, 'Name rule string is required.');
    assert(typeof rules.handshake === 'function', 'Handshake rule method is required.');

    rules.replicateOptions = rules.replicateOptions || {};
    rules.remoteIntroduceFeeds = rules.remoteIntroduceFeeds || pNoop;
    rules.remoteMessage = rules.remoteMessage || pNoop;
    this._rules.set(rules.name, rules);
  }

  async setParty({
    name, key, rules, isFeed, metadata,
  }) {
    assert(Buffer.isBuffer(key) || typeof key === 'string', 'Public key for the party is required.');
    assert(typeof rules === 'string' && rules.length > 0, 'Rules string is required.');

    const bufferKey = keyToBuffer(key);

    let party = {
      name: name || keyToHex(bufferKey),
      key: bufferKey,
      rules,
      isFeed,
      metadata,
    };

    if (!this._rules.has(rules)) {
      throw new Error(`There is not rules for "${rules}"`);
    }

    try {
      await this._root.putParty(party);

      const discoveryKey = keyToHex(getDiscoveryKey(bufferKey));

      this._parties.set(discoveryKey, party);

      party = this.party(discoveryKey);

      this.emit('party', party);

      return party;
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  party(key) {
    const hexKey = keyToHex(key);

    let party = this._parties.get(hexKey);

    if (!party) {
      party = Array.from(this._parties.values())
        .find(p => keyToHex(p.key) === hexKey || p.name === hexKey);
    }

    if (party && this._rules.has(party.rules)) {
      return Object.assign({}, party, {
        discoveryKey: getDiscoveryKey(party.key),
        rules: this._rules.get(party.rules),
      });
    }

    return null;
  }

  async loadParties(userPattern) {
    let pattern;
    if (Array.isArray(userPattern)) {
      pattern = userPattern.filter(Boolean).map(value => keyToHex(value));
    } else {
      pattern = keyToHex(userPattern);
    }

    const partiesLoaded = this.list().map(party => keyToHex(party.key));

    const partiesPersisted = (await this._root.getPartyList())
      .map(msg => msg.value)
      .filter(party => !partiesLoaded.includes(keyToHex(party.key)));

    const partiesToLoad = partiesPersisted.filter((party) => {
      const list = [party.name, keyToHex(party.key)].filter(Boolean);

      const matches = mm(list, pattern);

      return matches.length > 0;
    });

    try {
      return await Promise.all(partiesToLoad.map(party => this.setParty(party)));
    } catch (err) {
      debug(err);
      throw err;
    }
  }

  bindEvents(mega) {
    ['party', 'peer-add', 'peer-remove'].forEach((event) => {
      this.on(event, (...args) => mega.emit(event, ...args));
    });
  }
}

// codec to encode/decode party extension messages
Peer._codec = codecProtobuf(schema, {
  IntroduceFeeds: 0,
  EphemeralMessage: 1,
});

module.exports = PartyMap;

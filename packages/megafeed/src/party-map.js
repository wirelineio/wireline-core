//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const assert = require('assert');
const crypto = require('crypto');

const mm = require('micromatch');
const eos = require('end-of-stream');
const protocol = require('hypercore-protocol');
const debug = require('debug')('megafeed:party-map');
const protobuf = require('protobufjs');
const codecProtobuf = require('@wirelineio/codec-protobuf');

// utils
const { callbackPromise, resolveCallback } = require('./utils/promise-help');
const { keyToHex, keyToBuffer, getDiscoveryKey } = require('./utils/keys');

const schema = require('./schema.json');

const pNoop = () => Promise.resolve();

class Peer extends EventEmitter {
  static _parseTransactionMessages(type, message = {}) {
    switch (type) {
      case 'IntroduceFeeds': return Object.assign({}, message, {
        keys: message.keys ? message.keys.map(key => keyToBuffer(key)) : []
      });
      default: return {};
    }
  }

  constructor({ partyMap, party, stream, opts = {} }) {
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
    this.opts = Object.assign({}, opts, { stream });

    // we track each party message extension using transaction [ [id, promise] ]
    this.transactions = new Map();

    this.replicating = [];

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
      data: Peer._parseTransactionMessages(type, message)
    });

    resolveCallback(transaction, cb);

    return cb.promise;
  }

  sendMessage({ id, subject, data: userData }) {
    let data = userData;

    if (!Buffer.isBuffer(data)) {
      if (typeof data === 'object') {
        data = JSON.parse(data);
      }

      data = Buffer.from(data);
    }

    this.feed.extension('party', Peer._codec.encode({
      type: 'EphemeralMessage',
      message: {
        id: id || crypto.randomBytes(12).toString('hex'),
        subject,
        data
      }
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
            if (err) {
              console.error(err);
            }
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

    return new Promise((resolve, reject) => {
      this._transactionResolveReject(id, resolve, reject);

      const message = Object.assign({ id }, data);

      debug(`--> ${type}`, message);

      this.feed.extension('party', Peer._codec.encode({
        type,
        message
      }));
    });
  }

  _transactionResolveReject(id, resolve, reject) {
    const { rules: { options } } = this.party;

    let timer;

    const cleanTransaction = cb => (...args) => {
      if (timer) {
        clearTimeout(timer);
      }
      this.transactions.delete(id);
      cb(...args);
    };

    const _resolve = cleanTransaction(resolve);
    const _reject = cleanTransaction(reject);

    if (options.transactionTimeout) {
      timer = setTimeout(() => {
        _reject('Transaction timeout.');
      }, options.transactionTimeout);
    }

    this.transactions.set(id, { resolve: _resolve, reject: _reject });
  }

  async _onTransaction({ type, message, method }) {
    if (message.return) {
      // answer
      const { resolve } = this.transactions.get(message.id);
      debug(`<-- ${type}`, message);
      return resolve && resolve(message);
    }

    const data = await this.party.rules[method]({ peer: this, message });

    const returnMessage = Peer._parseTransactionMessages(
      type,
      Object.assign({ id: message.id, return: true }, data || {})
    );

    this.feed.extension('party', Peer._codec.encode({
      type,
      message: returnMessage
    }));
  }
}

class PartyMap extends EventEmitter {
  constructor(logs) {
    super();

    if (typeof logs === 'object' && logs.constructor.name === 'Megafeed') {
      this._root = logs._root;
      this._findFeed = logs.feedByDK.bind(logs);
    } else {
      this._root = logs.root;
      this._findFeed = logs.findFeed;
    }

    this._rules = new Map();

    this._parties = new Map();

    this._peers = new Set();
  }

  get id() {
    return this._root.feed.id;
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

    this.peers(partyKey).forEach((peer) => {
      peer.replicating.forEach((key) => {
        if (key === peer.feed.key.toString('hex')) {
          // The initial feed is the party, we don't want to share it.
          return null;
        }

        result.add(key);
      });
    });

    return Array.from(result.values()).map(key => keyToBuffer(key));
  }

  addPeer({ party, stream, opts }) {
    if (stream.destroyed) return;

    const peer = new Peer({ partyMap: this, party, stream, opts });

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

  setRules(rules) {
    const partyRules = rules;

    assert(typeof partyRules.name === 'string' && partyRules.name.length > 0, 'Name rule string is required.');
    assert(typeof partyRules.handshake === 'function', 'Handshake rule method is required.');

    if (!partyRules.options) {
      partyRules.options = {};
    }

    if (!partyRules.replicateOptions) {
      partyRules.replicateOptions = {};
    }

    if (!partyRules.remoteIntroduceFeeds) {
      partyRules.remoteIntroduceFeeds = pNoop;
    }

    if (!partyRules.remoteMessage) {
      partyRules.remoteMessage = pNoop;
    }

    this._rules.set(partyRules.name, partyRules);
  }

  async setParty({ name, key, rules, metadata }) {
    assert(Buffer.isBuffer(key) || typeof key === 'string', 'Public key for the party is required.');
    assert(typeof rules === 'string' && rules.length > 0, 'Rules string is required.');

    const bufferKey = keyToBuffer(key);

    let party = {
      name: name || keyToHex(bufferKey),
      key: bufferKey,
      rules,
      metadata
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
      throw err;
    }
  }

  party(key) {
    const hexKey = keyToHex(key);

    let party = this._parties.get(hexKey);

    if (!party) {
      party = Array.from(this._parties.values()).find(p => keyToHex(p.key) === hexKey || p.name === hexKey);
    }

    if (party && this._rules.has(party.rules)) {
      return Object.assign({}, party, {
        discoveryKey: getDiscoveryKey(party.key),
        rules: this._rules.get(party.rules)
      });
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
      throw err;
    }
  }

  replicate({ partyDiscoveryKey, ...options } = {}) {
    let stream;
    let party;
    let peer;

    let opts = Object.assign(
      { id: this.id, extensions: [] },
      options,
    );

    opts.extensions.push('party');

    const add = (discoveryKey) => {
      if (stream.destroyed) return null;

      if (!party) {
        const remoteParty = this.party(discoveryKey);

        if (remoteParty) {
          party = remoteParty;
          stream.feed(party.key);
        }

        return null;
      }

      const feed = this._findFeed(discoveryKey);
      if (feed && peer) {
        peer.replicate(feed);
      }

      return null;
    };

    if (partyDiscoveryKey) {
      party = this.party(partyDiscoveryKey);

      if (party) {
        const { replicateOptions = {} } = party.rules;
        opts = Object.assign({}, opts, replicateOptions);
      }
    }

    stream = protocol(opts);

    if (party) {
      stream.feed(party.key);
    }

    stream.on('feed', add);

    stream.once('handshake', () => {
      if (!stream.remoteSupports('party')) {
        throw new Error('The peer does not have support for the party extension.');
      }

      peer = this.addPeer({
        party, stream, opts,
      });

      resolveCallback(party.rules.handshake({ peer }), (err) => {
        if (err) {
          console.error(err);
        }
      });
    });

    return stream;
  }

  bindEvents(mega) {
    ['party', 'peer-add', 'peer-remove'].forEach((event) => {
      this.on(event, (...args) => mega.emit(event, ...args));
    });
  }
}

// codec to encode/decode party extension messages
Peer._codec = codecProtobuf(protobuf.Root.fromJSON(schema), {
  packageName: 'megafeed'
});

module.exports = PartyMap;

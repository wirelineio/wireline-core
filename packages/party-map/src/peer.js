//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const crypto = require('crypto');

const debug = require('debug')('party-map:peer');
const { codecProtobuf, protobuf } = require('@wirelineio/codec-protobuf');

// utils
const { keyToBuffer } = require('./utils/keys');

const schema = require('./schema.json');

const codec = codecProtobuf(protobuf.Root.fromJSON(schema), {
  packageName: 'partymap'
});

class Peer extends EventEmitter {
  static _parseTransactionMessages(type, message = {}) {
    switch (type) {
      case 'IntroduceFeeds': return Object.assign({}, message, {
        keys: message.keys ? message.keys.map(key => keyToBuffer(key)) : []
      });
      default: return {};
    }
  }

  static get codec() {
    return codec;
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

    const replicateOptions = Object.assign({}, this.opts, opts);

    feed.replicate(replicateOptions);

    this.replicating.push(key);

    if (!replicateOptions.live && replicateOptions.expectedFeeds === undefined) {
      this.stream.expectedFeeds = this.replicating.length;
    }

    return true;
  }

  introduceFeeds(message) {
    const type = 'IntroduceFeeds';

    return this._emitTransaction({
      type,
      data: Peer._parseTransactionMessages(type, message)
    });
  }

  sendMessage({ subject, data: userData }) {
    let data = userData;

    if (!Buffer.isBuffer(data)) {
      if (typeof data === 'object') {
        data = JSON.parse(data);
      }

      data = Buffer.from(data);
    }

    this.feed.extension('party', Peer.codec.encode({
      type: 'EphemeralMessage',
      message: {
        subject,
        data
      }
    }));
  }

  _initializePartyExtension() {
    const { rules } = this.party;

    this.feed.on('extension', async (extensionType, buffer) => {
      if (extensionType !== 'party') return;

      try {
        const { type, message } = Peer.codec.decode(buffer, false);

        switch (type) {
          case 'IntroduceFeeds':
            await this._onTransaction({ type, message, method: 'remoteIntroduceFeeds' });
            break;
          case 'EphemeralMessage':
            await rules.remoteMessage({ peer: this, message });
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('PartyExtensionError', err);
      }
    });
  }

  async _emitTransaction({ type, data }) {
    const id = crypto.randomBytes(12).toString('hex');

    return new Promise((resolve, reject) => {
      this._transactionResolveReject(id, resolve, reject);

      const message = Object.assign({ id }, data);

      debug(`--> ${type}`, message);

      this.feed.extension('party', Peer.codec.encode({
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

    this.feed.extension('party', Peer.codec.encode({
      type,
      message: returnMessage
    }));
  }
}

module.exports = Peer;

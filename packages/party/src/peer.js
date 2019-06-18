//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const crypto = require('crypto');
const debug = require('debug')('party-map:peer');

const { keyToBuffer } = require('@wirelineio/utils');

const codec = require('./codec');

/**
 * A Peer is a Node connected to the Swarm.
 */
class Peer extends EventEmitter {

  static _parseTransactionMessages(type, message = {}) {
    switch (type) {
      case 'IntroduceFeeds': return Object.assign({}, message, {
        keys: message.keys ? message.keys.map(key => keyToBuffer(key)) : []
      });
      case 'Request': return message;
      default: return {};
    }
  }

  static get codec() {
    return codec;
  }

  // TODO(burdon): Why is everything passed as on object? Including opts?
  // TODO(burdon): Every class is connected to every other class.
  constructor({ partyMap, party, stream, opts = {} }) {
    super();

    // We need to have access to the entire list of parties.
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

  /**
   * Starts replicating the given feed.
   */
  async replicate(feed, opts = {}) {
    await new Promise(resolve => feed.ready(resolve));

    // TODO(burdon): Silent failture?
    if (this.stream.destroyed) return null;

    const key = feed.key.toString('hex');
    if (this.replicating.includes(key)) {
      return false;
    }

    debug('replicate', { peerId: this.peerId.toString('hex'), replicate: feed.key.toString('hex') });

    // TODO(burdon): Stream is passed into the feed.
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

  request(message) {
    const type = 'Request';

    return this._emitTransaction({
      type,
      data: Peer._parseTransactionMessages(type, message)
    });
  }

  sendEphemeralMessage(message) {
    this.feed.extension('party', Peer.codec.encode({
      type: 'EphemeralMessage',
      message
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
            await this._onTransaction({ type, message, method: 'onIntroduceFeeds' });
            break;
          case 'Request':
            await this._onTransaction({ type, message, method: 'onRequest' });
            break;
          case 'EphemeralMessage':
            await rules.onEphemeralMessage({ peer: this, message });
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

      const message = Object.assign({ transaction: { id } }, data);

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
    const { transaction } = message;

    if (transaction && transaction.return) {
      // answer
      const { resolve } = this.transactions.get(transaction.id);
      debug(`<-- ${type}`, message);
      return resolve && resolve(message);
    }

    const data = await this.party.rules[method]({ peer: this, message });

    const returnMessage = Peer._parseTransactionMessages(
      type,
      Object.assign({
        transaction: { id: transaction.id, return: true }
      },
      data || {})
    );

    this.feed.extension('party', Peer.codec.encode({
      type,
      message: returnMessage
    }));
  }
}

module.exports = Peer;

//
// Copyright 2019 Wireline, Inc.
//
const { EventEmitter } = require('events');

const crypto = require('hypercore-crypto');
const protocol = require('hypercore-protocol');
const eos = require('end-of-stream');
const debug = require('debug')('party-map:party');

const { keyToHex, keyToBuffer, getDiscoveryKey } = require('./utils/keys');
const Peer = require('./peer');
const Rules = require('./rules');

class Party extends EventEmitter {
  static _addPartyExtension(obj) {
    if (!obj.extensions.includes('party')) {
      obj.extensions.push('party');
    }

    return obj;
  }

  constructor({ id = crypto.randomBytes(32), name, key, secretKey, rules, metadata = {} }) {
    super();

    if (!key) {
      const keys = crypto.keyPair();
      this.key = keys.publicKey;
      this.secretKey = keys.secretKey;
    } else {
      this.key = keyToBuffer(key);
      this.secretKey = keyToBuffer(secretKey);
    }

    this.discoveryKey = getDiscoveryKey(this.key);

    this.id = id;
    this.name = name || keyToHex(this.key);
    this.metadata = metadata;

    this.rules = null;

    this.setRules(rules);

    this._peers = new Set();
  }

  setRules(handler) {
    if (typeof handler === 'string') {
      console.warn(`Cannot set the rules ${handler} for party ${this.name}. It should be an object.`);
      return;
    }

    if (handler instanceof Rules) {
      this.rules = handler;
      return;
    }

    this.rules = new Rules(handler);
  }

  replicate(options = {}) {
    if (!this.rules) {
      throw new Error('Party needs rules for replicate.');
    }

    let stream;
    const party = this;
    let peer;

    const { replicateOptions = {} } = party.rules;

    const opts = Object.assign(
      { id: this.id, extensions: [] },
      replicateOptions,
      options
    );

    const add = async (discoveryKey) => {
      if (stream.destroyed) return null;
      if (discoveryKey.equals(party.discoveryKey)) {
        return null;
      }

      try {
        const feed = await party.rules.findFeed({ peer, discoveryKey });

        if (feed && peer) {
          peer.replicate(feed);
        }
      } catch (err) {
        console.error('Error trying to replicate a feed', {
          discoveryKey: keyToHex(discoveryKey),
          error: err.message
        });
      }
    };

    if (opts.stream) {
      const { stream: userStream } = opts;
      stream = userStream;
    } else {
      stream = protocol(opts);
    }

    stream = Party._addPartyExtension(stream);

    stream.feed(party.key);

    stream.on('feed', add);

    stream.once('handshake', async () => {
      if (!stream.remoteSupports('party')) {
        throw new Error('The peer does not have support for the party extension.');
      }

      peer = this.addPeer({
        party, stream, opts,
      });

      try {
        await party.rules.ready({ peer });

        await party.rules.handshake({ peer });
      } catch (err) {
        console.error('handshake', err);
      }
    });

    return stream;
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

  serialize() {
    return {
      name: this.name,
      key: this.key,
      secretKey: this.secretKey,
      rules: this.rules && this.rules.name ? this.rules.name : undefined,
      metadata: Buffer.isBuffer(this.metadata) ? this.metadata : Buffer.from(JSON.stringify(this.metadata))
    };
  }
}

module.exports = Party;

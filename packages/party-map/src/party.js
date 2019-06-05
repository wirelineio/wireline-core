//
// Copyright 2019 Wireline, Inc.
//
const assert = require('assert');
const { EventEmitter } = require('events');

const crypto = require('hypercore-crypto');
const protocol = require('hypercore-protocol');
const eos = require('end-of-stream');
const debug = require('debug')('party-map:party');

const { keyToHex, keyToBuffer, getDiscoveryKey } = require('./utils/keys');
const Peer = require('./peer');
const Rules = require('./rules');

class Party extends EventEmitter {
  constructor({ id = crypto.randomBytes(32), name, key, secretKey, rules, findFeed, metadata = {} }) {
    super();

    assert(Buffer.isBuffer(key) || typeof key === 'string', 'Public key for the party is required.');
    assert(typeof rules === 'object', 'Party rules are required.');

    const bufferKey = keyToBuffer(key);

    this.id = id;
    this.name = name || keyToHex(bufferKey);
    this.metadata = metadata;

    this.key = bufferKey;
    this.secretKey = keyToBuffer(secretKey);
    this.discoveryKey = getDiscoveryKey(key);

    this.setRules(rules);

    this._findFeed = findFeed;

    this._peers = new Set();
  }

  setRules(handler) {
    if (handler instanceof Rules) {
      this.rules = handler;
      return;
    }

    this.rules = new Rules(handler);
  }

  replicate(options = {}) {
    let stream;
    const party = this;
    let peer;

    const { replicateOptions = {} } = party.rules;

    const opts = Object.assign(
      { id: this.id, extensions: [] },
      replicateOptions,
      options
    );

    if (!opts.extensions.includes('party')) {
      opts.extensions.push('party');
    }

    const add = (discoveryKey) => {
      if (stream.destroyed) return null;

      const feed = this._findFeed(discoveryKey);
      if (feed && peer) {
        peer.replicate(feed);
      }

      return null;
    };

    stream = opts.stream || protocol(opts);

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

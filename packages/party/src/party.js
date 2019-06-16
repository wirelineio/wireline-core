//
// Copyright 2019 Wireline, Inc.
//
const { EventEmitter } = require('events');

const crypto = require('hypercore-crypto');
const protocol = require('hypercore-protocol');
const eos = require('end-of-stream');
const debug = require('debug')('party-map:party');

const { keyToHex, keyToBuffer, getDiscoveryKey } = require('@wirelineio/utils');

const Peer = require('./peer');
const Rules = require('./rules');

/**
 * A Party manages a set of peers that are subscribed to the same topic.
 * It controls the replicate of the associated hypercores based on configurable rules.
 */
class Party extends EventEmitter {

  constructor(options) {
    super();

    const { id = crypto.randomBytes(32), name, key, secretKey, rules, metadata = {} } = options;

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

    this.setRules(rules);

    this._peers = new Set();
  }

  setRules(handler) {
    // TODO(burdon): assert? Who are you writing this message to? No defensive programming.
    if (typeof handler === 'string') {
      console.warn(`Cannot set the rules ${handler} for party ${this.name}. It should be an object.`);
      return;
    }

    if (handler instanceof Rules) {
      this.rules = handler;
      return;
    }

    this.rules = new Rules(handler);
    return this.rules;
  }

  /**
   * When a party joins the swarm it creates a hypercore-protocol stream.
   * TODO(burdon): HOW does it join the swarm?
   *
   * @returns {Protocol} Dat protocol stream object.
   */
  replicate(options = {}) {
    // TODO(burdon): assert? Who are you writing this message to? No defensive programming.
    if (!this.rules) {
      throw new Error('Party needs rules for replicate.');
    }

    const { replicateOptions = {} } = this.rules;

    const opts = Object.assign({ id: this.id, extensions: [] }, replicateOptions, options);

    // TODO(burdon): Why would this be an option? Who would set this?
    const stream = opts.stream || protocol(opts);

    if (!stream.extensions.includes('party')) {
      stream.extensions.push('party');
    }

    stream.feed(this.key);

    // Created after handshake.
    let peer;

    stream.once('handshake', async () => {
      if (!stream.remoteSupports('party')) {
        throw new Error('The peer does not have support for the party extension.');
      }

      peer = this.addPeer({
        party: this, stream, opts,
      });

      try {
        await this.rules.ready({ peer });

        await this.rules.handshake({ peer });

        stream.emit('party-handshake', peer);
      } catch (err) {
        console.error('handshake', err);
      }
    });

    stream.on('feed', async (discoveryKey) => {
      if (stream.destroyed) {
        return null;
      }

      if (discoveryKey.equals(this.discoveryKey)) {
        return null;
      }

      try {
        // TODO(burdon): Is this the stream feed (above)?
        const feed = await this.rules.findFeed({ peer, discoveryKey });

        // TODO(burdon): What happens if feed or peer are null (and why would they be?)
        if (feed && peer) {
          peer.replicate(feed);
        }
      } catch (err) {
        // TODO(burdon): Silent failure?
        console.error('Error trying to replicate a feed', {
          discoveryKey: keyToHex(discoveryKey),
          error: err.message
        });
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

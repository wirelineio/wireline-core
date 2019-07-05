//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';
import protocol from 'hypercore-protocol';
import crypto from 'hypercore-crypto';

import { keyName, discoveryKey } from '../util/keys';

import { Codec } from './codec';

const log = debug('protocol');

/**
 * Protocol error with HTTP-like codes.
 * https://en.wikipedia.org/wiki/List_of_HTTP_status_codes
 */
export class ProtocolError extends Error {

  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }

  toString() {
    const parts = [ this.code ];
    if (this.message) { parts.push(this.message ); }
    return `ProtocolError(${parts.join(', ')})`;
  }
}

/**
 * Wraps a hypercore-protocol object.
 */
export class Protocol extends EventEmitter {

  /**
   * Protocol extensions.
   * @type {Map<type, Extension>}
   */
  _extensionMap = new Map();

  /**
   * https://github.com/mafintosh/hypercore-protocol
   * @type {{ on, once, feed, remoteId, remoteUserData }}
   */
  _stream = undefined;

  /**
   * @type {Object}
   */
  _userData = undefined;

  /**
   * https://github.com/mafintosh/hypercore-protocol#var-feed--streamfeedkey
   * @type {Feed}
   */
  _feed = undefined;

  /**
   * @param {{ id, codec }} options
   */
  constructor(options = {}) {
    super();

    this._id = options.id || crypto.keyPair().publicKey;
    this._codec = options.codec || new Codec();
  }

  toString() {
    const meta = {
      id: keyName(this._id),
      extensions: Array.from(this._extensionMap.keys())
    };

    return `Protocol(${JSON.stringify(meta)})`;
  }

  get id() {
    return this._id;
  }

  get stream() {
    return this._stream;
  }

  get feed() {
    return this._feed;
  }

  get discoveryKey() {
    return this._discoveryKey;
  }

  get extensions() {
    return Array.from(this._extensionMap.values());
  }

  /**
   * Sets user data which is exchanged with the peer during the handshake.
   * @param {Object} data
   * @returns {Protocol}
   */
  setUserData(data) {
    this._userData = this._codec.encode(data);

    return this;
  }

  /**
   * Sets the named extension.
   * @param {{ name, init, onMessage }} extension
   * @returns {Protocol}
   */
  setExtension(extension) {
    console.assert(extension);
    this._extensionMap.set(extension.name, extension);

    return this;
  }

  /**
   * Sets the set of extensions.
   * @param {[{ name, handler }]} extensions
   * @returns {Protocol}
   */
  setExtensions(extensions) {
    extensions.forEach(extension => this.setExtension(extension));

    return this;
  }

  /**
   * Returns the extension by name.
   * @param {string} name
   * @returns {Object} extension object.
   */
  getExtension(name) {
    const extension = this._extensionMap.get(name);
    console.assert(extension);
    return extension;
  }

  /**
   * Set protocol handshake handler.
   * @param {Function<{protocol}>} handler - Async handshake handler.
   * @returns {Protocol}
   */
  setHandshakeHandler(handler) {
    this.once('handshake', async () => {
      await handler(this);
    });

    return this;
  }

  /**
   * Initializes the protocol stream, creating a feed.
   *
   * https://github.com/mafintosh/hypercore-protocol
   *
   * @param {string} [initialKey]
   * @returns {Promise<Protocol>}
   */
  async init(initialKey) {
    console.assert(!this._stream);

    // See https://github.com/wirelineio/wireline-core/blob/master/docs/design/appendix.md#swarming--dat-protocol-handshake for details.

    // Initialize extensions.
    this._extensionMap.forEach(extension => {
      extension.init(this);
    });

    // Create the Dat stream.
    this._stream = protocol({
      id: this._id,
      userData: this._userData,
      extensions: Array.from(this._extensionMap.keys())
    });

    // Handshake.
    this._stream.once('handshake', async () => {
      const context = this.getContext();

      try {
        for (const [name, extension] of this._extensionMap) {
          if (this._stream.destroyed) {
            return;
          }

          log(`handshake extension "${name}": ${keyName(this._stream.id)} <=> ${keyName(this._stream.remoteId)}`);
          await extension.onHandshake(context);
        }

        if (this._stream.destroyed) {
          return;
        }

        log(`handshake: ${keyName(this._stream.id)} <=> ${keyName(this._stream.remoteId)}`);
        this.emit('handshake', this);
      } catch (err) {
        this._stream.destroy();
        this.emit('error', err);
      }
    });

    // If this protocol stream is being created via a swarm connection event,
    // only the client side will know the topic (i.e. initial feed key to share).
    if (initialKey) {
      this._discoveryKey = discoveryKey(initialKey);
      this._initStream(initialKey);
    } else {
      // Wait for the peer to share the initial feed and see if we have the public key for that.
      this._stream.once('feed', (discoveryKey) => {
        const discoveryToPublicKey = this._options.discoveryToPublicKey;

        initialKey = discoveryToPublicKey && discoveryToPublicKey(discoveryKey);
        if (!initialKey) {
          // Stream will get aborted soon as both sides haven't shared the same initial Dat feed.
          console.warn('Public key not found for discovery key: ', keyName(this._id, 'node'), keyName(discoveryKey));

          return;
        }

        if (this._feed) {
          console.warn('Protocol already initialized.');
          return;
        }

        this._discoveryKey = discoveryKey;
        this._initStream(initialKey);

        this._stream.on('feed', (discoveryKey) => {
          const context = this.getContext();

          this._extensionMap.forEach(extension => {
            extension.onFeed(context, discoveryKey);
          });
        });
      });
    }

    log(keyName(this._id, 'node'), 'initialized');
    return this;
  }

  /**
   * Get context.
   * @returns {{}}
   */
  getContext() {
    return this._codec.decode(this._stream.remoteUserData);
  }

  /**
   * Init Dat stream by sharing the same initial feed key.
   * https://datprotocol.github.io/how-dat-works/#feed-message
   * @param key
   * @private
   */
  _initStream(key) {
    log(keyName(this._id, 'node'), 'shared initial feed', keyName(this._discoveryKey));
    this._feed = this._stream.feed(key);
    this._feed.on('extension', this._extensionHandler);
  }

  /**
   * Handles extension messages.
   */
  _extensionHandler = async (name, message) => {
    const extension = this._extensionMap.get(name);
    if (!extension) {
      console.warn('Missing extension: ' + name);
      this.emit('error');
      return;
    }

    await extension.onMessage(this.getContext(), message);
  }
}

//
// Copyright 2019 Wireline, Inc.
//
import assert from 'assert';
import { EventEmitter } from 'events';

import debug from 'debug';
import uuid from 'uuid/v4';

import { keyName } from '../util/keys';

import { Codec } from './codec';
import { ProtocolError } from './protocol';

const log = debug('extension');

/**
 * Reliable message passing via using Dat protocol extensions.
 *
 * Events: "send", "receive", "error"
 */
export class Extension extends EventEmitter {

  /**
   * @type {Protocol}
   */
  _protocol = null;

  /**
   * Pending messages.
   * @type {Map<{id, Function}>}
   */
  _pendingMessages = new Map();

  /**
   * Handshake handler.
   * @type {Function<{protocol, context}>}
   */
  _handshakeHandler = null;

  /**
   * Message handler.
   * @type {Function<{protocol, context, message}>}
   */
  _messageHandler = null;

  /**
   * Feed handler.
   * @type {Function<{protocol, context, discoveryKey}>}
   */
  _feedHandler = null;

  _stats = {
    send: 0,
    receive: 0,
    error: 0
  };

  /**
   * @param {string} name
   * @param {Object} options
   * @param {Number} options.timeout
   * @param {Codec} options.codec
   */
  constructor(name, options = {}) {
    super();
    assert(typeof name === 'string' && name.length > 0, 'Name is required.');

    this._name = name;

    this._options = Object.assign({
      timeout: 2000,
      codec: new Codec()
    }, options);
  }

  get name() {
    return this._name;
  }

  get stats() {
    return this._stats;
  }

  /**
   * Sets the handshake handler.
   * @param {Function<{protocol, context}>} handshakeHandler - Async handshake handler.
   * @returns {Extension}
   */
  setHandshakeHandler(handshakeHandler) {
    this._handshakeHandler = handshakeHandler;

    return this;
  }

  /**
   * Sets the message handler.
   * @param {Function<{protocol, context, message}>} messageHandler - Async message handler.
   * @returns {Extension}
   */
  setMessageHandler(messageHandler) {
    this._messageHandler = messageHandler;

    return this;
  }

  /**
   * Sets the message handler.
   * @param {Function<{protocol, context, discoveryKey}>} feedHandler - Async feed handler.
   * @returns {Extension}
   */
  setFeedHandler(feedHandler) {
    this._feedHandler = feedHandler;

    return this;
  }

  /**
   * Initializes the extension.
   *
   * @param {Protocol} protocol
   */
  init(protocol) {
    console.assert(!this._protocol);
    log(`init[${this._name}]: ${keyName(protocol.id)}`);

    this._protocol = protocol;
  }

  /**
   * Handshake event.
   *
   * @param {Object} context
   */
  onHandshake(context) {
    if (this._handshakeHandler) {
      this._handshakeHandler(this._protocol, context);
    }
  }

  /**
   * Receives extension message.
   *
   * @param {Object} context
   * @param {Buffer} message
   */
  async onMessage(context, message) {
    const { id, error, message: requestData, options = {} } = this._options.codec.decode(message);

    // Check for a pending request.
    // TODO(burdon): Explicitely check code header property?
    const senderCallback = this._pendingMessages.get(id);
    if (senderCallback) {
      this._pendingMessages.delete(id);
      senderCallback(context, requestData, error);
      return;
    }

    if (!this._messageHandler) {
      console.warn('No message handler.');
      this.emit('error', new ProtocolError(500, 'No message handler'));
      return;
    }

    try {
      // Process the message.
      log(`received ${keyName(this._protocol.stream.id, 'node')}: ${keyName(id, 'msg')}`);
      const responseData = await this._messageHandler(this._protocol, context, requestData);

      if (options.oneway) {
        return;
      }

      // Send the response.
      const response = { id, message: responseData };
      log(`responding ${keyName(this._protocol.stream.id, 'node')}: ${keyName(id, 'msg')}`);
      this._protocol.feed.extension(this._name, this._options.codec.encode(response));
    } catch (ex) {
      if (options.oneway) {
        return;
      }

      // System error.
      const code = (ex instanceof ProtocolError) ? ex.code : 500;
      const response = { id, error: { code, error: ex.message } };
      this._protocol.feed.extension(this._name, this._options.codec.encode(response));
    }
  }

  /**
   * Feed event.
   *
   * @param {Object} context
   * @param {Buffer} discoveryKey
   */
  onFeed(context, discoveryKey) {
    if (this._feedHandler) {
      this._feedHandler(this._protocol, context, discoveryKey);
    }
  }

  /**
   * Sends a message to peer.
   * @param {Object} message
   * @param {Object} options
   * @param {Boolean} options.oneway
   * @returns {Promise<Object>} Response from peer.
   */
  async send(message, options = {}) {
    const { oneway = false } = options;

    const request = {
      id: uuid(),
      message,
      options: {
        oneway
      }
    };

    // Send the message.
    // TODO(burdon): Is it possible to have a stream event, where retrying would be appropriate?
    this._send(request);

    if (oneway) {
      return;
    }

    // Set the callback to be called when the response is received.
    this._pendingMessages.set(request.id, async (context, response, error) => {

      log(`response ${keyName(this._protocol.stream.id, 'node')}: ${keyName(request.id, 'msg')}`);
      this._stats.receive++;
      this.emit('receive', this._stats);
      promise.done = true;

      if (error) {
        promise.reject(error);
        return;
      }

      if (promise.expired) {
        console.warn('Timed out.');
        this.emit('error', new ProtocolError(408));
        return;
      }

      promise.resolve({ context, response });
    });

    // Trigger the callback.
    const promise = {};
    return new Promise((resolve, reject) => {
      promise.resolve = resolve;
      promise.reject = reject;

      // Set timeout.
      if (this._options.timeout) {
        setTimeout(() => {
          if (!promise.done) {
            promise.expired = true;
            this._stats.error++;
            reject({ code: 408 });
          }
        }, this._options.timeout);
      }
    });
  }

  /**
   * Sends a extension message.
   *
   * @param {Buffer} message
   * @returns {Boolean}
   */
  _send(request) {
    log(`sending a message ${keyName(this._protocol.stream.id, 'node')}: ${keyName(request.id, 'msg')}`);
    this._protocol.feed.extension(this._name, this._options.codec.encode(request));

    this._stats.send++;
    this.emit('send', this._stats);
  }
}

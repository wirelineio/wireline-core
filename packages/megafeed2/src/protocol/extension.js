//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';
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
   * Pending messages.
   * @type {Map<{id, Function}>}
   */
  _pendingMessages = new Map();

  /**
   * Message handler.
   * @type {Function<{context, message}>}
   */
  _messageHandler = undefined;

  /**
   * @type {{ stream, feed }}
   */
  _protocol = undefined;

  /**
   * @type {string}
   */
  _extension = undefined;

  _stats = {
    send: 0,
    receive: 0,
    error: 0
  };

  /**
   * @param {string} name
   * @param {{ codec, timeout }} options
   */
  constructor(name, options = {}) {
    super();

    this._name = name;

    this._options = Object.assign({
      timeout: 2000,
    }, options);

    this._codec = options.codec || new Codec();
  }

  get name() {
    return this._name;
  }

  get stats() {
    return this._stats;
  }

  /**
   * Initializes the extension.
   *
   * @param {Protocol} protocol
   * @param {string} extension
   */
  init(protocol, extension) {
    console.assert(!this._protocol);
    log(`init[${extension}]: ${keyName(protocol.id)}`);

    this._protocol = protocol;
    this._extension = extension;
  }

  /**
   * Receives extension message.
   *
   * @param context
   * @param request
   */
  async onMessage(context, request) {
    const { id, error, message: requestData } = this._codec.decode(request);

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

      // Send the response.
      const response = { id, message: responseData };
      log(`responding ${keyName(this._protocol.stream.id, 'node')}: ${keyName(id, 'msg')}`);
      this._protocol.feed.extension(this._extension, this._codec.encode(response));
    } catch (ex) {
      // System error.
      const code = (ex instanceof ProtocolError) ? ex.code : 500;
      const response = { id, error: { code, error: ex.message } };
      this._protocol.feed.extension(this._extension, this._codec.encode(response));
    }
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
   * Sends message to peer.
   * @param {Object} message
   * @returns {Promise<Object>} Response from peer.
   */
  async send(message) {
    const request = {
      id: uuid(),
      message
    };

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

    // Send the message.
    // TODO(burdon): Is it possible to have a stream event, where retrying would be appropriate?
    log(`sending ${keyName(this._protocol.stream.id, 'node')}: ${keyName(request.id, 'msg')}`);
    this._protocol.feed.extension(this._extension, this._codec.encode(request));

    this._stats.send++;
    this.emit('send', this._stats);

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
}

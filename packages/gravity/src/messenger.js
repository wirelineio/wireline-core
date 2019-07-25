//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';

import { Extension, ProtocolError } from '@wirelineio/protocol';
import { keyName } from './util';

const log = debug('messenger');

/**
 * Manages key exchange and feed replication.
 */
export class Messenger extends EventEmitter {

  static extension = 'messenger';

  /**
   * @param {{ timeout }} [options]
   */
  constructor(options) {
    super();

    this._options = Object.assign({
      timeout: 1000
    }, options);
  }

  toString() {
    const meta = {};

    return `Messenger(${JSON.stringify(meta)})`;
  }

  /**
   * Creates a protocol extension for key exchange.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Messenger.extension, { timeout: this._options.timeout })
      .on('error', err => this.emit(err))
      .setMessageHandler(this._extensionHandler.bind(this));
  }

  /**
   * Handles key exchange requests.
   */
  async _extensionHandler(protocol, context, message) {
    // TODO(burdon): Check credentials. By topic?
    if (!context.user) {
      throw new ProtocolError(401);
    }

    log('received', keyName(protocol.id, 'node'), message);

    // TODO(burdon): Handler?
    this.emit('message', message);
    return null;
  }

  /**
   * Sends and receives a message
   * @param protocol
   * @param message
   * @returns {Promise<[{string}]>}
   */
  async broadcast(protocol, message) {
    const extension = protocol.getExtension(Messenger.extension);
    console.assert(extension);

    log('sending', keyName(protocol.id, 'node'), message);
    const { response } = await extension.send(message);

    return response;
  }
}

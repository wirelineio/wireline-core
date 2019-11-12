//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { EventEmitter } from 'events';

import { keyToHex, keyToBuffer } from '@wirelineio/utils';

import { Extension } from './extension';
import {Cardcase} from '@wirelineio/cardcase';

const log = debug('protocol:auth');

/**
 * Peer chat.
 */
export class Auth extends EventEmitter {

  static EXTENSION_NAME = 'auth';

  /**
   * @constructor
   * @param {string} peerId
   */
  constructor(peerId, authHints)  {
    super();

    console.assert(Buffer.isBuffer(peerId));

    this._peerId = peerId;
    
    this._framework = null;
    this._authHints = authHints;
  }
  
  setFramework(framework) {
    this._framework = framework;
  }

  /**
   * Create protocol extension.
   * @return {Extension}
   */
  createExtension() {
    return new Extension(Auth.EXTENSION_NAME, { binary: true })
      .setFeedHandler(this._onFeed.bind(this))
      .setHandshakeHandler(this._onHandshake.bind(this))
      .setMessageHandler(this._onMessage.bind(this))
      .setCloseHandler(this._onClose.bind(this));
  }

  _onFeed(protocol, context, discoveryKey) {
    //log('onFeed', protocol, context, discoveryKey);
  }
  
  async _onHandshake(protocol, context) {
    const authenticator = new Authenticator(this._authHints);
    await authenticator.build(this._framework);
    const ok = await authenticator.authenticate(context.auth);
    if (ok) {
      log('Authenticated!');
    } else {
      throw new Error('Unauthorized access rejected!');
    }
  }
  
  _onMessage() {
    //log('onMessage', arguments);
  }
  
  _onClose(error, protocol, context) {
    //log('onClose', arguments);
  }
}

export class Authenticator {
  constructor(authHints) {
    this._allowedKeys = new Set();
    this._allowedFeeds = new Set();
    this._cardcase = new Cardcase();
    if (authHints) {
      if (authHints.keys) {
        for (const key of authHints.keys) {
          this._allowedKeys.add(key);
          log('Allowing hinted key:', key)
        }
      }
      if (authHints.feeds) {
        for (const feed of authHints.feeds) {
          this._allowedFeeds.add(feed);
          log('Allowing hinted feed:', feed)
        }
      }
    }
  }
  
  async authenticate(auth) {
    if (await this.verify(auth)) {
      if (Math.abs(Date.now() - auth.signed_at) > 24*60*60*1000) {
        log('Signature OK, but message is too old:', auth.signed_at);
        return false;
      }
      for (let sig of auth.signatures) {
        if (this._allowedKeys.has(sig.key)) {
          log('Signed by known key: ', sig.key);
          return true;
        } else {
          log('Signed by unknown key:', sig.key);
        }
      }
    }
    return false;
  }
  
  async verify(message) {
    if (!message || !message.signatures) {
      log(message, 'not signed!');
      return false;
    }
    
    for await (const sig of message.signatures) {
      const result = await this._cardcase.verify(message.data, sig.signature, sig.key);
      if (!result) {
        log('Signature could not be verified for', sig.signature, sig.key, 'on message', message);
        return false;
      }
    }
    return true;
  };


  async build(framework) {
    //TODO(telackey): This is a ridiculously inefficient way to do this.
    //In reality, we'd need to take the Genesis message from the feed we control
    //and use that as the starting point.  We also need causal ordering. 
    //But for now, we trust anything already written and verifiable to be valid.
    const results = await Promise.all(framework.mega.getFeeds().map((f) => {
      const stream = f.createReadStream();
      const collect = [];
      return new Promise((resolve, reject) => {
        stream.on('end', () => {
          resolve(collect);
        });
        stream.on('error', (e) => {
          reject(e);
        });
        stream.on('data', (data) => {
          collect.push(data);
        });
      });
    }));
    
    
    for await (const group of results) {
      for await (const msg of group) {
        if (msg.type) {
          switch (msg.type) {
            case 'party.genesis':
            case 'party.admit.key': {
              if (await this.verify(msg)) {
                msg.data.message.admit.forEach(k => {
                  if (!this._allowedKeys.has(k)) {
                    log('Admitting key: ', k);
                    this._allowedKeys.add(k);
                  }
                });
              }
              break;
            }
            case 'party.admit.feed': {
              if (await this.verify(msg)) {
                if (!this._allowedFeeds.has(msg.data.message.feed)) {
                  log('Authorizing feed: ', msg.data.message.feed);
                  this._allowedFeeds.add(msg.data.message.feed);
                }
              }
              break;
            }
          }
        }
      }
    }
  }
}
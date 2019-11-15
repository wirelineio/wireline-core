//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Keyring } from './crypto';

const ONE_HOUR = 60 * 60 * 1000;
const log = debug('creds:authentication');

/**
 * Authenticate and verify messages.
 * Used by AuthExtension for authenticating nodes during
 * handshake.
 */
export class Authentication {
  constructor(view, authHints) {
    this._view = view;
    this._queue = [];
    this._allowedKeys = new Set();
    this._allowedFeeds = new Set();
    this._keyring = new Keyring();

    if (authHints) {
      if (authHints.keys) {
        for (const key of authHints.keys) {
          this._allowedKeys.add(key);
          log('Allowing hinted key:', key);
        }
      }
      if (authHints.feeds) {
        for (const feed of authHints.feeds) {
          this._allowedFeeds.add(feed);
          log('Allowing hinted feed:', feed);
        }
      }
    }

    this._view.events.once('party.genesis', this._enqueue.bind(this));
    this._view.events.on('party.admit.key', this._enqueue.bind(this));
    this._view.events.on('party.admit.feed', this._enqueue.bind(this));

    this._draining = false;
  }

  admitKey(key) {
    if (key && !this._allowedKeys.has(key)) {
      log('Admitting key:', key);
      this._allowedKeys.add(key);
    }
  }

  authorizeFeed(feed) {
    if (feed && !this._allowedFeeds.has(feed)) {
      log('Authorizing feed:', feed);
      this._allowedFeeds.add(feed);
    }
  }

  async authenticate(authHandshake) {
    if (await this._verifySignatures(authHandshake)) {
      const now = Date.now();
      // TODO(telackey): This is not how it should be done.  We
      // would rather use the remote nonce for anti-replay, but we
      // will need to add hooks for retrieving it and signing it
      // between connect() and handshake() to do that.  In the meantime,
      // not allowing infinite replay is at least something.
      if (Math.abs(now - authHandshake.signed_at) > 24 * ONE_HOUR) {
        log('Signature OK, but time skew is too great: Now:', now, ', Signature:', authHandshake.signed_at);
        return false;
      }
      for (const sig of authHandshake.signatures) {
        if (this._allowedKeys.has(sig.key)) {
          log('Auth signed by known key:', sig.key);
          return true;
        }
        log('Auth signed by unknown key:', sig.key);
      }
    } else {
      log('Unable to verify auth message:', authHandshake);
    }
    return false;
  }

  async _verifySignatures(message, requireKnownSigKey = false) {
    if (!message || !message.signatures) {
      log(message, 'not signed!');
      return false;
    }

    let foundKnownKey = false;

    for await (const sig of message.signatures) {
      const result = await this._keyring.verify(message.data, sig.signature, sig.key);
      if (!result) {
        log('Signature could not be verified for', sig.signature, sig.key, 'on message', message);
        return false;
      }
      if (this._allowedKeys.has(sig.key)) {
        log('Message signed with known key:', sig.key);
        foundKnownKey = true;
      }
    }

    if (requireKnownSigKey && !foundKnownKey) {
      log('All signatures checked out, but no known key used', message);
      return false;
    }

    return true;
  }

  async _onAdmit(msg) {
    const requireKnownSigKey = msg.type !== 'party.genesis';
    if (await this._verifySignatures(msg, requireKnownSigKey)) {
      if (msg.data && msg.data.message && Array.isArray(msg.data.message.admit)) {
        msg.data.message.admit.forEach((k) => {
          this.admitKey(k);
        });
      } else {
        log('Badly formed admit message:', msg);
      }
    } else {
      log('Unable to verify admit message:', msg);
    }
  }

  async _onFeed(msg) {
    if (await this._verifySignatures(msg, true)) {
      if (msg.data && msg.data.message && msg.data.message.feed) {
        this.authorizeFeed(msg.data.message.feed);
      } else {
        log('Badly formed feed authorization message:', msg);
      }
    } else {
      log('Unable to verify feed authorization message:', msg);
    }
  }

  _enqueue(msg) {
    this._queue.push(msg);
    setImmediate(this._drain.bind(this));
  }

  async _drain() {
    if (this._draining) {
      return;
    }

    this._draining = true;
    while (this._queue.length) {
      try {
        const msg = this._queue.shift();
        log('Processing', msg.type);
        switch (msg.type) {
          case 'party.genesis':
          case 'party.admit.key':
            await this._onAdmit(msg);
            break;
          case 'party.admit.feed':
            await this._onFeed(msg);
            break;
          default:
            log('Unknown message type:', msg.type);
        }
      } catch (err) {
        log(err);
      }
    }
    this._draining = false;
  }
}

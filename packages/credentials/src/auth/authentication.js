//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Keyring } from '../crypto';

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

    // There is no need to re-process the
    this._view.events.once('party.genesis', this._enqueue.bind(this));
    this._view.events.on('party.admit.key', this._enqueue.bind(this));
    this._view.events.on('party.admit.feed', this._enqueue.bind(this));
    this._view.events.on('party.greeter.envelope', this._enqueue.bind(this));

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
    if (!authHandshake) {
      log('Missing auth!');
      return false;
    }

    const verified = await this._verifySignatures(authHandshake, true);
    if (!verified) {
      log('Unable to verify auth message:', authHandshake);
      return false;
    }

    // TODO(telackey): This is not how it should be done.  We would rather use the remote
    //  nonce for anti-replay, but we will need to add hooks for retrieving it and signing it
    //  between connect() and handshake() to do that.  In the meantime, not allowing infinite replay
    //  is at least something.
    const now = Date.now();
    if (Math.abs(now - authHandshake.created) > 24 * ONE_HOUR) {
      log('Signature OK, but time skew is too great: Now:', now, ', Signature:', authHandshake.created);
      return false;
    }

    return true;
  }

  async _verifySignatures(signedMessage, requirePreviouslyAdmittedKey = false) {
    const { signed, signatures } = signedMessage;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      log(signedMessage, 'not signed!');
      return false;
    }

    let foundKnownKey = false;

    for await (const sig of signatures) {
      const result = await this._keyring.verify(signed, sig.signature, sig.key);
      if (!result) {
        log('Signature could not be verified for', sig.signature, sig.key, 'on message', signedMessage);
        return false;
      }
      if (this._allowedKeys.has(sig.key)) {
        log('Message signed with known key:', sig.key);
        foundKnownKey = true;
      }
    }

    if (requirePreviouslyAdmittedKey && !foundKnownKey) {
      log('All signatures checked out, but no known key used', signedMessage);
      return false;
    }

    return true;
  }

  async _onAdmit(msg, requirePreviouslyAdmittedKey = true) {
    const verified = await this._verifySignatures(msg.data, requirePreviouslyAdmittedKey);
    if (!verified) {
      log('Unable to verify admit message:', msg);
      return;
    }

    const { original } = msg.data.signed;
    if (!original.admit) {
      log('Badly formed admit message:', msg);
      return;
    }

    // TODO(telackey):  Missing checks:
    //  1. party field matches the party we are under

    if (Array.isArray(original.admit)) {
      original.admit.forEach((k) => {
        this.admitKey(k);
      });
    } else {
      this.admitKey(original.admit);
    }
  }

  async _onFeed(msg) {
    const verified = await this._verifySignatures(msg.data, true);
    if (!verified) {
      log('Unable to verify feed authorization message:', msg);
      return;
    }

    const { original } = msg.data.signed;
    if (!original.feed) {
      log('Badly formed feed authorization message:', msg);
      return;
    }

    this.authorizeFeed(original.feed);
  }

  _enqueue(msg) {
    this._queue.push(msg);
    setImmediate(this._drain.bind(this));
  }

  async unwrap(msg) {
    if (msg.type !== 'party.greeter.envelope') {
      return { msg, greeter: null };
    }

    // Verify the outer message
    log(`Unwrapping ${msg.type} ...`);
    const verified = await this._verifySignatures(msg.data, true);
    if (!verified) {
      log('Unable to verify enveloped message:', msg);
      return null;
    }

    return {
      msg: msg.data.signed.original.contents,
      greeter: msg.author,
    };
  }

  async _drain() {
    if (this._draining) {
      return;
    }

    this._draining = true;
    while (this._queue.length) {
      try {
        const { msg, greeter } = await this.unwrap(this._queue.shift());
        log('Processing', msg.type);
        switch (msg.type) {
          case 'party.genesis':
            await this._onAdmit(msg, false);
            break;
          case 'party.admit.key':
            await this._onAdmit(msg, !greeter);
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

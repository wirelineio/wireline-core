//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { keyToHex } from '@wirelineio/utils';

import { Keyring, KeyTypes } from '../crypto';

const ONE_HOUR = 60 * 60 * 1000;

const log = debug('creds:authentication');

export const AuthMessageTypes = Object.freeze({
  GENESIS: 'party.genesis',
  ADMIT_KEY: 'party.admit.key',
  ADMIT_FEED: 'party.admit.feed',
  ENVELOPE: 'party.envelope',
});

/**
 * Authenticate and verify messages.
 * Used by AuthExtension for authenticating nodes during handshake.
 */
export class Authentication {
  constructor(authHints = null) {
    this._hints = authHints;
    this._keyring = new Keyring();
  }

  async init() {
    if (this._hints) {
      if (this._hints.keys) {
        for (const key of this._hints.keys) {
          log('Allowing hinted key:', keyToHex(key));
          await this._admitKey(key, { hint: true });
        }
      }
      if (this._hints.feeds) {
        for (const feed of this._hints.feeds) {
          log('Allowing hinted feed:', keyToHex(feed));
          await this._admitFeed(feed, { hint: true });
        }
      }
    }
    return this;
  }

  /**
   * Authenticate the credentials presented during handshake.
   * The signatures must be valid and belong to an approved key.
   * @param credentials
   * @returns {Promise<boolean>} true if authenticated, else false
   */
  async authenticate(credentials) {
    console.assert(credentials);
    if (!credentials) {
      log(`Bad credentials: ${credentials}`);
      return false;
    }

    const verified = await this._verifySignatures(credentials, true);
    if (!verified) {
      log(`Bad credentials: ${credentials}`);
      return false;
    }

    // TODO(telackey): This is not how it should be done.  We would rather use the remote
    //  nonce for anti-replay, but we will need to add hooks for retrieving it and signing it
    //  between connect() and handshake() to do that.  In the meantime, not allowing infinite replay
    //  is at least something.
    const now = Date.now();
    if (Math.abs(now - credentials.created) > 24 * ONE_HOUR) {
      log(`Time skew too great: Now: ${now}; Sig: ${credentials.created}`);
      return false;
    }

    return true;
  }

  /**
   * Process a replicated party authentication message, admitting keys or feeds to the party.
   * @param message
   * @returns {Promise<undefined|void>}
   */
  async processMessage(message) {
    console.assert(message);

    const { signed, signatures } = message;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      throw new Error(`Bad message: ${JSON.stringify(message)}`);
    }
    let requireKnownKey = true;

    if (signed.type === AuthMessageTypes.ENVELOPE) {
      message = await this._unwrap(message);
      // With an envelope, the outer message will be signed by the known key of the Greeter, but the inner message
      // will be signed by unknown keys, since they were submitted during the greeting process (ie, before being
      // admitted to the party).
      requireKnownKey = false;
    }

    switch (signed.type) {
      case AuthMessageTypes.GENESIS:
        return this._processGenesis(message);
      case AuthMessageTypes.ADMIT_KEY:
        return this._processAdmitKey(message, requireKnownKey);
      case AuthMessageTypes.ADMIT_FEED:
        return this._processAdmitFeed(message, requireKnownKey);
      default:
        throw new Error(`Bad type: ${signed.type}`);
    }
  }


  /**
   * Process a party.genesis message.
   * @param message
   * @returns {Promise<void>}
   * @private
   */
  async _processGenesis(message) {
    console.assert(message);
    if (message.signed.type !== AuthMessageTypes.GENESIS) {
      throw new Error(`Wrong type: ${message.signed.type}`);
    }

    // The Genesis is the root message, so cannot require a previous key.
    const verified = await this._verifyMsg(message, false);
    if (!verified) {
      throw new Error(`Unverifiable message: ${JSON.stringify(message)}`);
    }

    const signedBy = this.signingKeys(message);

    const { admit, feed } = message.signed;
    this._admitKey(admit, { signedBy });
    this._admitFeed(feed, { signedBy });
  }

  /**
   * Process a party.admit.key message.
   * @param message
   * @param requireKnownKey
   * @returns {Promise<void>}
   * @private
   */
  async _processAdmitKey(message, requireKnownKey = true) {
    console.assert(message);
    if (message.signed.type !== AuthMessageTypes.ADMIT_KEY) {
      throw new Error(`Wrong type: ${message.signed.type}`);
    }

    const verified = await this._verifyMsg(message, requireKnownKey);
    if (!verified) {
      throw new Error(`Bad message: ${message}`);
    }

    const signedBy = this.signingKeys(message);

    const { admit } = message.signed;
    this._admitKey(admit, { signedBy });
  }

  /**
   * Process a party.admit.feed message.
   * @param message
   * @param requireKnownKey
   * @returns {Promise<void>}
   * @private
   */
  async _processAdmitFeed(message, requireKnownKey = true) {
    console.assert(message);
    if (message.signed.type !== AuthMessageTypes.ADMIT_FEED) {
      throw new Error(`Wrong type: ${message.signed.type}`);
    }

    const verified = await this._verifyMsg(message, requireKnownKey);
    if (!verified) {
      throw new Error(`Bad message: ${message}`);
    }

    const signedBy = this.signingKeys(message);

    const { feed } = message.signed;
    this._admitFeed(feed, { signedBy });
  }

  /**
   * If this is an envelope, return the interior message, else the message.
   * @param message
   * @returns {Promise<*>}
   * @private
   */
  async _unwrap(message) {
    console.assert(message);
    if (message.signed.type !== AuthMessageTypes.ENVELOPE) {
      return message;
    }

    // The outer envelope must always be signed with a known key.
    const verified = await this._verifySignatures(message, true);
    if (!verified) {
      throw new Error(`Bad envelope: ${message}`);
    }

    return message.signed.original.contents;
  }

  /**
   * Verify the signatures and basic structure common to all messages.
   * @param message
   * @param requireKnownKey
   * @returns {Promise<boolean>}
   * @private
   */
  async _verifyMsg(message, requireKnownKey) {
    console.assert(message);

    const { signed, signatures } = message;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      log('Bad message:', message);
      return false;
    }

    const { party, admit, feed } = message.signed;

    switch (signed.type) {
      case AuthMessageTypes.GENESIS:
        if (!admit || !feed) {
          log('Bad message:', message);
          return false;
        }
        break;
      case AuthMessageTypes.ADMIT_FEED:
        if (!feed) {
          log('Bad message:', message);
          return false;
        }
        break;
      case AuthMessageTypes.ADMIT_KEY:
        if (!admit) {
          log('Bad message:', message);
          return false;
        }
        break;
      default:
        log(`Bad type: ${signed.type}`);
    }

    const sigOk = await this._verifySignatures(message, requireKnownKey);
    if (!sigOk) {
      log('Bad signature: ', message);
      return false;
    }

    // TODO(telackey):  Missing checks:
    //  1. That the party field in the message matches the party we are under.
    //  2. If this is the Genesis message, check that the signing party is this party.

    return true;
  }

  /**
   * Verify that all the signatures on a signed message are valid.
   * Optionally, also require that the signature belong to know, already approved keys.
   * @param message
   * @param requireKnownKey
   * @returns {Promise<boolean>}
   * @private
   */
  async _verifySignatures(message, requireKnownKey = false) {
    const { signed, signatures } = message;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      log(message, 'not signed!');
      return false;
    }

    let foundKnownKey = false;

    for await (const sig of signatures) {
      const result = await this._keyring.verify(signed, sig.signature, sig.key);
      if (!result) {
        log('Bad signature:', sig);
        return false;
      }

      const known = await this._hasKey(sig.key);
      if (known) {
        log('Message signed with known key:', keyToHex(sig.key));
        foundKnownKey = true;
      }
    }

    if (requireKnownKey && !foundKnownKey) {
      log('Valid signatures, but no known key:', message);
      return false;
    }

    return true;
  }

  /**
   * What keys were used to sign this message?
   * @param message
   * @returns {Array|*}
   */
  signingKeys(message) {
    const { signed, signatures } = message;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      return [];
    }

    return signatures.map(sig => sig.key);
  }

  /**
   * Is the key in the keyring.
   * @param key
   * @returns {Promise<boolean>}
   * @private
   */
  async _hasKey(key) {
    if (Buffer.isBuffer(key)) {
      key = keyToHex(key);
    }
    const existing = await this._keyring.get(key);
    return !!existing;
  }

  /**
   * Is the feed in the keyring.
   * @param feed
   * @returns {Promise<boolean>}
   * @private
   */
  async _hasFeed(feed) {
    const existing = await this._keyring.findOne({ key: feed, type: KeyTypes.FEED });
    return !!existing;
  }

  /**
   * Admit the key to the allowed list.
   * @param key
   * @param attributes
   * @returns {boolean} true if added, false if already present
   * @private
   */
  async _admitKey(key, attributes = {}) {
    console.assert(key);
    const existing = await this._hasKey(key);
    if (!existing) {
      log('Admitting key:', keyToHex(key));
      await this._keyring.add(key, attributes);
      return true;
    }
    return false;
  }

  /**
   * Admit the feed to the allowed list.
   * @param feed
   * @param attributes
   * @returns {boolean} true if added, false if already present
   * @private
   */
  async _admitFeed(feed, attributes = {}) {
    console.assert(feed);
    const existing = await this._hasFeed(feed);
    if (!existing) {
      log('Admitting feed:', keyToHex(feed));
      attributes.type = KeyTypes.FEED;
      await this._keyring.add(feed, attributes);
      return true;
    }
    return false;
  }
}

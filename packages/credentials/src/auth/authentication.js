//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Keyring } from '../crypto';

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
    this._allowedKeys = new Set();
    this._allowedFeeds = new Set();
    this._keyring = new Keyring();

    if (authHints) {
      if (authHints.keys) {
        for (const key of authHints.keys) {
          log('Allowing hinted key:', key);
          this._allowedKeys.add(key);
        }
      }
      if (authHints.feeds) {
        for (const feed of authHints.feeds) {
          log('Allowing hinted feed:', feed);
          this._allowedFeeds.add(feed);
        }
      }
    }
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
    let requireKnownKey = true;

    if (message.type === AuthMessageTypes.ENVELOPE) {
      message = await this._unwrap(message);
      // With an envelope, the outer message will be signed by the known key of the Greeter, but the inner message
      // will be signed by unknown keys, since they were submitted during the greeting process (ie, before being
      // admitted to the party).
      requireKnownKey = false;
    }

    switch (message.type) {
      case AuthMessageTypes.GENESIS:
        return this._processGenesis(message);
      case AuthMessageTypes.ADMIT_KEY:
        return this._processAdmitKey(message, requireKnownKey);
      case AuthMessageTypes.ADMIT_FEED:
        return this._processAdmitFeed(message, requireKnownKey);
      default:
        throw new Error(`Bad message type: ${message.type}`);
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
    if (message.type !== AuthMessageTypes.GENESIS) {
      throw new Error(`Wrong type: ${message.type}`);
    }

    // The Genesis is the root message, so cannot require a previous key.
    const verified = await this._verifyMsg(message, false);
    if (!verified) {
      throw new Error(`Bad message: ${message}`);
    }

    const { original } = message.data.signed;
    this._admitKey(original.admit);
    this._admitFeed(original.feed);
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
    if (message.type !== AuthMessageTypes.ADMIT_KEY) {
      throw new Error(`Wrong type: ${message.type}`);
    }

    const verified = await this._verifyMsg(message, requireKnownKey);
    if (!verified) {
      throw new Error(`Bad message: ${message}`);
    }

    const { original } = message.data.signed;
    this._admitKey(original.admit);
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
    if (message.type !== AuthMessageTypes.ADMIT_FEED) {
      throw new Error(`Wrong type: ${message.type}`);
    }

    const verified = await this._verifyMsg(message, requireKnownKey);
    if (!verified) {
      throw new Error(`Bad message: ${message}`);
    }

    const { original } = message.data.signed;
    this._admitFeed(original.feed);
  }

  /**
   * If this is an envelope, return the interior message, else the message.
   * @param message
   * @returns {Promise<*>}
   * @private
   */
  async _unwrap(message) {
    console.assert(message);
    if (message.type !== AuthMessageTypes.ENVELOPE) {
      return message;
    }

    // The outer envelope must always be signed with a known key.
    const verified = await this._verifySignatures(message.data, true);
    if (!verified) {
      throw new Error(`Bad envelope: ${message}`);
    }

    return message.data.signed.original.contents;
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

    const { original } = message.data.signed;
    if (!original) {
      log(`Bad message: ${message}`);
      return false;
    }

    switch (message.type) {
      case AuthMessageTypes.GENESIS:
        if (!original.admit || !original.feed) {
          log(`Bad message: ${message}`);
          return false;
        }
        break;
      case AuthMessageTypes.ADMIT_FEED:
        if (!original.feed) {
          log(`Bad message: ${message}`);
          return false;
        }
        break;
      case AuthMessageTypes.ADMIT_KEY:
        if (!original.admit) {
          log(`Bad message: ${message}`);
          return false;
        }
        break;
      default:
        log(`Bad message type: ${message.type}`);
    }

    const sigOk = await this._verifySignatures(message.data, requireKnownKey);
    if (!sigOk) {
      log(`Bad signature: ${message}`);
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
   * @param signedMessage
   * @param requireKnownKey
   * @returns {Promise<boolean>}
   * @private
   */
  async _verifySignatures(signedMessage, requireKnownKey = false) {
    const { signed, signatures } = signedMessage;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      log(signedMessage, 'not signed!');
      return false;
    }

    let foundKnownKey = false;

    for await (const sig of signatures) {
      const result = await this._keyring.verify(signed, sig.signature, sig.key);
      if (!result) {
        log(`Bad signature: Sig: ${sig.signature}; Key: ${sig.key}; Msg: ${signedMessage}`);
        return false;
      }
      if (this._allowedKeys.has(sig.key)) {
        log(`Message signed with known key: ${sig.key}`);
        foundKnownKey = true;
      }
    }

    if (requireKnownKey && !foundKnownKey) {
      log(`Valid signatures, but no known key: ${JSON.stringify(signedMessage)}`);
      return false;
    }

    return true;
  }

  /**
   * Admit the key to the allowed list.
   * @param key
   * @returns {boolean} true if added, false if already present
   * @private
   */
  _admitKey(key) {
    console.assert(key);
    if (!this._allowedKeys.has(key)) {
      log('Admitting key:', key);
      this._allowedKeys.add(key);
      return true;
    }
    return false;
  }

  /**
   * Admit the feed to the allowed list.
   * @param feed
   * @returns {boolean} true if added, false if already present
   * @private
   */
  _admitFeed(feed) {
    console.assert(feed);
    if (!this._allowedFeeds.has(feed)) {
      log('Admitting feed:', feed);
      this._allowedFeeds.add(feed);
      return true;
    }
    return false;
  }
}

//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { keyToHex } from '@wirelineio/utils';

import { PartyMessageTypes } from './partyMessage';
import { Keyring, KeyTypes } from '../crypto';

const log = debug('creds:party');

/**
 * Build up the party from signed messages.
 */
export class Party {
  constructor(partyKey) {
    console.assert(Buffer.isBuffer(partyKey));
    this._partyKey = partyKey;
    this._keyring = new Keyring();
  }

  get key() {
    return this._partyKey;
  }

  /**
   * Process a replicated party authentication message, admitting keys or feeds to the party.
   * @param message
   * @returns {Promise<undefined|void>}
   */
  async processMessage(message) {
    console.assert(message);

    const original = message;
    if (message.data) {
      message = message.data;
    }

    let { signed, signatures } = message;
    if (!signed || !signatures || !Array.isArray(signatures)) {
      throw new Error(`Bad message: ${JSON.stringify(message)}`);
    }
    let requireKnownKey = true;

    if (signed.type === PartyMessageTypes.ENVELOPE) {
      message = await this._unwrap(message);
      signed = message.signed;
      signatures = message.signatures;
      // With an envelope, the outer message will be signed by the known key of the Greeter, but the inner message
      // will be signed by unknown keys, since they were submitted during the greeting process (ie, before being
      // admitted to the party).
      requireKnownKey = false;
    }

    switch (signed.type) {
      case PartyMessageTypes.GENESIS:
        return this._processGenesis(message);
      case PartyMessageTypes.ADMIT_KEY:
        return this._processAdmitKey(message, requireKnownKey);
      case PartyMessageTypes.ADMIT_FEED:
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
    if (message.signed.type !== PartyMessageTypes.GENESIS) {
      throw new Error(`Wrong type: ${message.signed.type}`);
    }

    // The Genesis is the root message, so cannot require a previous key.
    const verified = await this._verifyMsg(message, false);
    if (!verified) {
      throw new Error(`Unverifiable message: ${JSON.stringify(message)}`);
    }

    // TODO: Check that the Genesis message matches our expected party.

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
    if (message.signed.type !== PartyMessageTypes.ADMIT_KEY) {
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
    if (message.signed.type !== PartyMessageTypes.ADMIT_FEED) {
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
    if (message.signed.type !== PartyMessageTypes.ENVELOPE) {
      return message;
    }

    // The outer envelope must always be signed with a known key.
    const verified = await this._verifySignatures(message, true);
    if (!verified) {
      throw new Error(`Bad envelope: ${JSON.stringify(message)}`);
    }

    return message.signed.contents;
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
      case PartyMessageTypes.GENESIS:
        if (!admit || !feed) {
          log('Bad message:', message);
          return false;
        }
        break;
      case PartyMessageTypes.ADMIT_FEED:
        if (!feed) {
          log('Bad message:', message);
          return false;
        }
        break;
      case PartyMessageTypes.ADMIT_KEY:
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
      log('Rejecting unverified message.');
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
      log('Bad message:', message);
      return false;
    }

    let foundKnownKey = false;
    for await (const sig of signatures) {
      const result = await this._keyring.verify(signed, sig.signature, sig.key);
      if (!result) {
        log('Bad signature:', keyToHex(sig));
        return false;
      }

      const known = await this._hasKey(sig.key);
      if (known) {
        log('Message signed with known key:', keyToHex(sig.key));
        foundKnownKey = true;
      }
    }

    if (requireKnownKey && !foundKnownKey) {
      log('Valid signatures, but no known key.');
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
   * Is the indicated key a trusted key associated with this party.
   * @param key
   * @returns {boolean|Promise<boolean>}
   */
  async isTrustedKey(key) {
    if (!key) {
      return false;
    }
    return this._hasKey(key);
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

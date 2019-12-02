//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { keyToHex } from '@wirelineio/utils';

import { Keyring, KeyTypes } from '../crypto';

const ONE_HOUR = 60 * 60 * 1000;

const log = debug('creds:authentication');

/**
 * Authenticate and verify messages.
 * Used by AuthExtension for authenticating nodes during handshake.
 */
export class Authentication {
  constructor(party, hints = null) {
    console.assert(party);
    this._hints = hints;
    this._party = party;
    this._keyring = new Keyring();
  }

  async init() {
    if (this._hints) {
      if (this._hints.keys) {
        for (const key of this._hints.keys) {
          log('Allowing hinted key:', keyToHex(key));
          await this._keyring.add(key, { hint: true });
        }
      }
      if (this._hints.feeds) {
        for (const feed of this._hints.feeds) {
          log('Allowing hinted feed:', keyToHex(feed));
          await this._keyring.add(feed, { hint: true, type: KeyTypes.FEED });
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
      log('Bad credentials:', credentials);
      return false;
    }

    // TODO(telackey): This is not how it should be done.  We would rather use the remote
    //  nonce for anti-replay, but we will need to add hooks for retrieving it and signing it
    //  between connect() and handshake() to do that.  In the meantime, not allowing infinite replay
    //  is at least something.
    const now = Date.now();
    if (Math.abs(now - credentials.signed.created) > 24 * ONE_HOUR) {
      log(`Bad credentials: time skew too great: Now: ${now}; Sig: ${credentials.signed.created}`);
      return false;
    }

    // Check that the signature is valid.
    const verified = await this._keyring.verify(credentials);
    if (!verified) {
      log(`Bad signature: ${credentials}`);
      return false;
    }

    // Now check that the signing key is truly authorized.
    for await (const sig of credentials.signatures) {
      const trusted = await this._party.isTrustedKey(sig.key);
      if (trusted) {
        log('Credentials signed with trusted key:', keyToHex(sig.key));
        return true;
      }

      const hinted = await this._keyring.has(sig.key);
      if (hinted) {
        log('Credentials signed with hinted key:', keyToHex(sig.key));
        return true;
      }
    }

    log('Unauthorized credentials');
    return false;
  }
}

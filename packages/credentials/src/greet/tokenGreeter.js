//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';

import { ProtocolError } from '@wirelineio/protocol';

import { Keyring } from '../crypto';

const log = debug('creds:greet:token');

/**
 * To be used for outside-of-party auth with the Greeter (NYI).
 */
class Token {
  constructor(targetParty, expiration = null) {
    this._party = targetParty;
    this._expiration = expiration;
    this._value = crypto.randomBytes(32).toString('hex');
    this._challenge = crypto.randomBytes(8).toString('hex');
    this._redeemed = null;
    this._revoked = null;
  }

  get party() {
    return this._party;
  }

  get live() {
    return !this.redeemed && !this.expired && !this.revoked;
  }

  get value() {
    return this._value;
  }

  get revoked() {
    return !!(this._revoked);
  }

  get redeemed() {
    return !!(this._redeemed);
  }

  get expired() {
    if (this._expiration) {
      return Date.now() >= this._expiration;
    }
    return false;
  }

  get challenge() {
    return this._challenge;
  }

  revoke() {
    if (!this.live) {
      return false;
    }
    this._revoked = Date.now();
    return true;
  }

  redeem() {
    if (!this.live) {
      return false;
    }
    this._redeemed = Date.now();
    return true;
  }

  export() {
    return {
      type: 'token',
      party: this.party,
      token: this.value,
      challenge: this.challenge,
    };
  }
}

export class TokenGreeter {
  constructor(partyWriter, gatherHints, props) {
    this._props = props;
    this._keyring = new Keyring();
    this._tokens = new Map();
    this._partyWriter = partyWriter;
    this._gatherHints = gatherHints;
  }

  _isAllowedParty(party) {
    return true;  // NYI
  }

  async _redeemToken(tokenValue, targetParty) {
    // Do we recognize the key?
    const token = this._tokens.get(tokenValue);
    if (!token) {
      log('Unable to locate token:', tokenValue);
      return null;
    }

    if (targetParty !== token.party) {
      log(`${targetParty} does not match ${token.party}`);
      token.revoke();
      return null;
    }

    this._tokens.delete(token.value);
    return token;
  }

  issueToken({ token, party, expiration }) {
    if (token) {
      party = token.party;
      expiration = token.expiration;
    }

    if (!this._isAllowedParty(party)) {
      throw new Error(`Invalid party: ${party}`);
    }

    const ret = new Token(party, expiration);
    this._tokens.set(ret.value, ret);
    return ret.export();
  }

  async handleMessage(message) {
    console.assert(message);
    const { command, token, party, params } = message;

    const redeemed = await this._redeemToken(token, party);
    if (!redeemed) {
      throw new ProtocolError(401, `Bad token: ${token}`);
    }

    if (command === 'negotiate') {
      const next = this.issueToken(redeemed);
      return { token: next.token, challenge: next.challenge };
    }

    if (command === 'submit') {
      for await (const msg of params) {
        // The message needs to have our challenge inside it.
        if (msg.data.signed.original.challenge !== redeemed.challenge) {
          throw new ProtocolError(401, `Bad challenge: ${msg.data.signed.original.challenge}`);
        }

        if (!msg.type.startsWith('party.admit.')) {
          throw new ProtocolError(403, `Bad type: ${msg.type}`);
        }

        // And the signature needs to check out.
        const verified = await this._keyring.verify(msg);
        if (!verified) {
          throw new ProtocolError(401, 'Bad signature');
        }
      }

      const messages = await this._partyWriter(params);
      const hints = await this._gatherHints(params);
      return {
        messages,
        hints
      };
    }

    // Default case.
    throw new ProtocolError(404, `Unknown command ${command}`);
  }
}

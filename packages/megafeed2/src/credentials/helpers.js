//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';
import canonicalStringify from 'canonical-json';
import { isEqual } from 'lodash';

import { keyStr } from '../util';

const log = debug('helpers');

/**
 * Creates an item (genesis message).
 * @param {Buffer} ownerKey
 * @returns {Object} item
 */
export const createItem = (ownerKey) => {
  console.assert(ownerKey);

  const itemKeyPair = crypto.keyPair();
  const item = {
    type: 'wrn:protobuf:wirelineio.credential.ItemGenesis',
    key: keyStr(itemKeyPair.publicKey),
    ownerKey: keyStr(ownerKey)
  };

  const signature = signObject(item, itemKeyPair.secretKey);

  // Burn the item secret key after signing the genesis block.
  itemKeyPair.secretKey = undefined;

  return {
    ...item,
    signature
  };
};

/**
 * Creates a party genesis message.
 * Signed with the secret key from the party keypair.
 * @param {Buffer} ownerKey
 * @param {Buffer} feedKey
 * @returns {Object} party
 */
export const createPartyGenesis = (ownerKey, feedKey) => {
  console.assert(ownerKey);
  console.assert(feedKey);

  const partyKeyPair = crypto.keyPair();
  const party = {
    type: 'wrn:protobuf:wirelineio.credential.PartyGenesis',
    partyKey: keyStr(partyKeyPair.publicKey),
    ownerKey: keyStr(ownerKey),
    feedKey: keyStr(feedKey)
  };

  const signature = signObject(party, partyKeyPair.secretKey);

  // Burn the party secret key after signing the genesis block.
  partyKeyPair.secretKey = undefined;

  return {
    ...party,
    signature
  };
};

/**
 * Creates a feed genesis message.
 * Signed with the secret key of the feed (for easier out of band verification).
 * @param {{publickey, secretKey}} feedKey
 * @param {Buffer} ownerKey
 * @param {Buffer} partyKey
 * @returns {Object} feed
 */
export const createFeedGenesis = (feedKeyPair, ownerKey, partyKey) => {
  console.assert(feedKeyPair);
  console.assert(ownerKey);
  console.assert(partyKey);

  const feed = {
    type: 'wrn:protobuf:wirelineio.credential.FeedGenesis',
    feedKey: keyStr(feedKeyPair.publicKey),
    ownerKey: keyStr(ownerKey),
    partyKey: keyStr(partyKey)
  };

  const signature = signObject(feed, feedKeyPair.secretKey);

  return {
    ...feed,
    signature
  };
};

/**
 * Create auth proof payload (unsigned).
 * @param {Buffer} publicKey
 * @param {number} nonce
 * @return {{type: string, nonce: number, key: string}}
 */
export const createAuthProofPayload = (publicKey, nonce) => {
  console.assert(publicKey);
  console.assert(nonce);

  const proof = {
    type: 'wrn:protobuf:wirelineio.credential.Auth',
    key: keyStr(publicKey),
    nonce
  };

  return proof;
};

/**
 * Sign auth proof payload.
 * @param {Object} proof
 * @param {Buffer} secretKey
 * @return {Object}
 */
export const signAuthProofPayload = (proof, secretKey) => {
  console.assert(proof);
  console.assert(secretKey);
  console.assert(proof.type === 'wrn:protobuf:wirelineio.credential.Auth');

  const signature = signObject(proof, secretKey);

  return {
    ...proof,
    signature
  }
};

/**
 * Verify auth proof.
 * @param {Object} proof
 * @param {number} nonce
 * @param {string} publicKey
 * @return {boolean}
 */
export const verifyAuthProof = (proof, nonce, publicKey) => {
  console.assert(proof);
  console.assert(nonce);
  console.assert(publicKey);

  return verifyObject(proof) && proof.nonce === nonce && proof.key === publicKey;
};

/**
 * Sign an object.
 * @param {Object} obj
 * @param {Buffer} secretKey
 * @return {string} signature
 */
export const signObject = (obj, secretKey) => {
  return keyStr(crypto.sign(Buffer.from(canonicalStringify(obj)), secretKey));
};

/**
 * Verify obj.
 * @param {Object} obj - Object to verify.
 * @param {string} [keyAttr] - Public key attribute name.
 * @returns {boolean}
 */
export const verifyObject = (obj, keyAttr = 'key') => {
  console.assert(obj);

  const key = obj[keyAttr];
  console.assert(key);

  const { signature } = obj;
  console.assert(signature);

  const clone = { ...obj };
  delete clone.signature;

  return crypto.verify(
    Buffer.from(canonicalStringify(clone)),
    Buffer.from(signature, 'hex'),
    Buffer.from(key, 'hex')
  );
};

/**
 * Auth provider (used to sign requests).
 */
export class AuthProvider {

  /**
   * @constructor
   * @param {{publicKey, secretKey}} keyPair
   */
  constructor(keyPair) {
    console.assert(keyPair);
    this._keyPair = keyPair;
  }

  get publicKey() {
    return this._keyPair.publicKey;
  }

  /**
   * Request user to sign the data (e.g., async using a popup).
   * @param {Object} data
   * @return {Promise<Object>}
   */
  async requestSignature(data) {
    return signAuthProofPayload(data, this._keyPair.secretKey);
  }
}

/**
 * Create party invite (written to feed of inviter).
 * Signed with the secret key of the inviting feed.
 * @param {Buffer} partyKey
 * @param {Object} inviter
 * @param {Object} invitee
 * @return {{key, inviteeFeedKey, inviteeOwnerKey, type: string}}
 */
export const createPartyInvite = (partyKey, inviter, invitee) => {
  console.assert(partyKey);
  console.assert(inviter);
  console.assert(inviter.feedKey);
  console.assert(inviter.secretKey);
  console.assert(invitee);
  console.assert(invitee.ownerKey);
  console.assert(invitee.feedKey);

  const partyInvite = {
    type: 'wrn:protobuf:wirelineio.party.Invite',
    inviterFeedKey: keyStr(inviter.feedKey),
    partyKey: keyStr(partyKey),
    inviteeOwnerKey: keyStr(invitee.ownerKey),
    inviteeFeedKey: keyStr(invitee.feedKey)
  };

  const signature = signObject(partyInvite, inviter.secretKey);

  return {
    ...partyInvite,
    signature
  };
};

/**
 * Verify party invite chain.
 * @param {string} partyKey
 * @param {Array{Object}} inviteChain
 * @param {Function} genesisBlockLoader
 * @return {{boolean, string}}
 */
export const verifyPartyInviteChain = async (partyKey, inviteChain, genesisBlockLoader) => {
  console.assert(partyKey);
  console.assert(inviteChain);
  console.assert(inviteChain.length);

  // The invite chain ALWAYS begins with the party genesis block.
  const partyGenesis = inviteChain[0];
  console.assert(partyGenesis);
  console.assert(partyGenesis.type === 'wrn:protobuf:wirelineio.credential.PartyGenesis');

  log(partyKey, partyGenesis);

  // Verify signature on party genesis block.
  if (!verifyObject(partyGenesis, 'partyKey')) {
    return { verified: false, error: 'Signature mismatch.' };
  }

  // Are we talking about the same party?
  if (partyKey !== partyGenesis.partyKey) {
    return { verified: false, error: 'Party key mismatch.' };
  }

  // Check genesis block in the chain actually matches the one on the feed.
  if (!isEqual(partyGenesis, await genesisBlockLoader(partyGenesis.feedKey))) {
    return { verified: false, error: 'Party genesis block mismatch.' };
  }

  // Walk the chain, verifying data.
  let inviterFeedKey = partyGenesis.feedKey;
  for (let i = 1; i < inviteChain.length; i++) {
    log(partyKey, inviteChain[i]);

    const partyInvite = inviteChain[i];
    console.assert(partyInvite);
    console.assert(partyInvite.type === 'wrn:protobuf:wirelineio.party.Invite');

    // Verify signature on feed genesis block.
    if (!verifyObject(partyInvite, 'inviterFeedKey')) {
      return { verified: false, error: 'Signature mismatch.' };
    }

    // Does the invite link back to the previous party feed?
    if (partyInvite.inviterFeedKey !== inviterFeedKey) {
      return { verified: false, error: 'Inviter feed mismatch.' };
    }

    // Load the feed genesis block for more checks.
    const feedGenesis = await genesisBlockLoader(partyInvite.inviteeFeedKey);
    console.assert(feedGenesis);
    console.assert(feedGenesis.type === 'wrn:protobuf:wirelineio.credential.FeedGenesis');

    // Verify signature on feed genesis block.
    if (!verifyObject(feedGenesis, 'feedKey')) {
      return { verified: false, error: 'Signature mismatch.' };
    }

    // Are we talking about the same party?
    if (partyKey !== feedGenesis.partyKey) {
      return { verified: false, error: 'Party key mismatch.' };
    }

    // Are the party invite and feed genesis block referring to the same party?
    if (partyInvite.partyKey !== feedGenesis.partyKey) {
      return { verified: false, error: 'Party key mismatch.' };
    }

    // Are the party invite and feed genesis block referring to the same owner?
    if (partyInvite.inviteeOwnerKey !== feedGenesis.ownerKey) {
      return { verified: false, error: 'Invitee feed owner mismatch.' };
    }

    // Are the party invite and feed genesis block referring to the same feed key?
    if (partyInvite.inviteeFeedKey !== feedGenesis.feedKey) {
      return { verified: false, error: 'Invitee feed key mismatch.' };
    }

    // Note: Can't reliably check for the party invite on existing feeds as it may not have been written yet.

    // Update the inviter feed key for the next round of checks.
    inviterFeedKey = feedGenesis.feedKey;
  }

  return { verified: true };
};

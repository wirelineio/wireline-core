//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import canonicalStringify from 'canonical-json';

import { keyStr } from '../util';

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
 * Creates a party (genesis message).
 * @param {Buffer} ownerKey
 * @param {Buffer} feedKey
 * @returns {Object} party
 */
export const createParty = (ownerKey, feedKey) => {
  console.assert(ownerKey);

  const partyKeyPair = crypto.keyPair();
  const party = {
    type: 'wrn:protobuf:wirelineio.credential.PartyGenesis',
    key: keyStr(partyKeyPair.publicKey),
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
 * @param {Object} obj
 * @returns {boolean}
 */
export const verifyObject = (obj) => {
  console.assert(obj);

  const { key, signature } = obj;
  console.assert(key);
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

//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import canonicalStringify from 'canonical-json';

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
    key: itemKeyPair.publicKey.toString('hex'),
    ownerKey: ownerKey.toString('hex')
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
    key: partyKeyPair.publicKey.toString('hex'),
    ownerKey: ownerKey.toString('hex'),
    feedKey: feedKey.toString('hex')
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
 * Create authentication proof.
 * @param {{publicKey, secretKey}} keyPair
 * @param {number} nonce
 * @return {{type, nonce, key, signature}}
 */
export const createAuthProof = (keyPair, nonce) => {
  console.assert(keyPair);
  console.assert(nonce);

  const { publicKey, secretKey } = keyPair;
  console.assert(publicKey);
  console.assert(secretKey);

  const proof = {
    type: 'wrn:protobuf:wirelineio.credential.Auth',
    key: publicKey.toString('hex'),
    nonce
  };

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
  return crypto
    .sign(Buffer.from(canonicalStringify(obj)), secretKey)
    .toString('hex');
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

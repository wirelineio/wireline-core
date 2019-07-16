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

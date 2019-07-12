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

  const signature = signItem(item, itemKeyPair.secretKey);

  // Burn the item secret key after signing the genesis block.
  itemKeyPair.secretKey = undefined;

  return {
    ...item,
    signature
  };
};

/**
 * Sign an item.
 * @param {Object} item
 * @param {Buffer} secretKey
 * @return {string} signature
 */
export const signItem = (item, secretKey) => {
  return crypto
    .sign(Buffer.from(canonicalStringify(item)), secretKey)
    .toString('hex');
};

/**
 * Verify item.
 * @param {Object} item
 * @returns {boolean}
 */
export const verifyItem = (item) => {
  console.assert(item);

  const { type, key, ownerKey, signature } = item;

  console.assert(type);
  console.assert(key);
  console.assert(ownerKey);
  console.assert(signature);

  const itemClone = { ...item };
  delete itemClone.signature;

  return crypto.verify(
    Buffer.from(canonicalStringify(itemClone)),
    Buffer.from(signature, 'hex'),
    Buffer.from(key, 'hex')
  );
};

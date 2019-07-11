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

  const itemKeys = crypto.keyPair();
  const item = {
    type: 'wrn:protobuf:wirelinio.credential.ItemGenesis',
    key: itemKeys.publicKey.toString('hex'),
    ownerKey: ownerKey.toString('hex')
  };

  const signature = signItem(item, itemKeys.secretKey);

  // Burn the item secret key after signing the genesis block.
  itemKeys.secretKey = undefined;

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

  return crypto.verify(
    Buffer.from(canonicalStringify({ type, key, ownerKey })),
    Buffer.from(signature, 'hex'),
    Buffer.from(key, 'hex')
  );
};

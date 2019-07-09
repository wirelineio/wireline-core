//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';

/**
 * Item factory.
 */
export class ItemFactory {

  constructor(itemType) {
    console.assert(itemType);
    this._itemType = itemType;
  }

  createItem(type, id, keyPair, signature = '') {
    console.assert(type);
    console.assert(id);
    console.assert(keyPair);

    return this._itemType.create({
      type,
      id,
      ownerKey: keyPair.publicKey.toString('hex'),
      signature
    });
  }

  signItem(item, keyPair) {
    console.assert(item);
    console.assert(keyPair);

    // Empty signature field before encoding.
    item.signature = '';

    const buffer = this._itemType.encode(item).finish();
    item.signature = crypto.sign(buffer, keyPair.secretKey).toString('hex');

    return item;
  }

  verifyItem(item, publicKey) {
    console.assert(item);
    console.assert(publicKey);

    const itemClone = this._itemType.fromObject({ ...this._itemType.toObject(item), signature: '' });
    const buffer = this._itemType.encode(itemClone).finish();
    return crypto.verify(buffer, Buffer.from(item.signature, 'hex'), publicKey);
  }
}

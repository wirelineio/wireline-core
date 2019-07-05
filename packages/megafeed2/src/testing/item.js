//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';

import { ItemProto } from './item_proto';

/**
 * Item utilities.
 */
export class ItemStateMachine {

  /**
   * Creates a signed message that designates a new Item.
   *
   * @param type
   * @param ownerKey
   * @return {Message<ItemProto.Item>}
   */
  static createItem(type, ownerKey) {
    const keyPair = crypto.keyPair();

    // TODO(burdon): Create credential signed with item's secretKey.
    return ItemProto.Item.create({
      type,
      key: keyPair.publicKey,
      ownerKey
    });
  }
}

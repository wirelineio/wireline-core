//
// Copyright 2019 Wireline, Inc.
//

import protobuf from 'protobufjs';

import ItemProtoDefs from './item.proto';

const { root: ItemProtoRoot } = protobuf.parse(ItemProtoDefs);

export const ItemProto = {
  Item: ItemProtoRoot.lookupType('item.Item')
};

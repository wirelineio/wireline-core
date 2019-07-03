//
// Copyright 2019 Wireline, Inc.
//

import protobuf from 'protobufjs';

import CoreProtoDefs from './core.proto';

const { root: CoreProtoRoot } = protobuf.parse(CoreProtoDefs);

export const CoreProto = {
  AnyType: CoreProtoRoot.lookupType('core.AnyType')
};

//
// Copyright 2019 Wireline, Inc.
//

import protobuf from 'protobufjs';

import ChessProtoDefs from './chess.proto';

const { root: ChessProtoRoot } = protobuf.parse(ChessProtoDefs);

export const ChessProto = {
  Game: ChessProtoRoot.lookupType('chess.Game'),
  Move: ChessProtoRoot.lookupType('chess.Move')
};

//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@dxos/codec-protobuf';

import partyProtobuf from './partyConstruction';
import authProtobuf from '../auth/auth';

export const partyCodec = new Codec('.dxos.party.SignedMessage')
  .addJson(partyProtobuf)
  .addJson(authProtobuf)
  .build();

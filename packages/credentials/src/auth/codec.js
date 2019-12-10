//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@dxos/codec-protobuf';

import authProtobuf from './auth';
import partyProtobuf from '../party/partyConstruction';

export const authCodec = new Codec('.dxos.party.SignedMessage')
  .addJson(partyProtobuf)
  .addJson(authProtobuf)
  .build();

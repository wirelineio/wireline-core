//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/codec-protobuf';

import partyProtobuf from './partyConstruction';
import authProtobuf from '../auth/auth';

export const partyCodec = new Codec({ rootTypeUrl: '.dxos.party.SignedMessage' })
  .addJson(partyProtobuf)
  .addJson(authProtobuf)
  .build();

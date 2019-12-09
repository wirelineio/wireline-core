//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/codec-protobuf';

import authProtobuf from './auth';
import partyProtobuf from '../party/partyConstruction';

export const authCodec = new Codec({ rootTypeUrl: '.dxos.party.SignedMessage' })
  .addJson(partyProtobuf)
  .addJson(authProtobuf)
  .build();

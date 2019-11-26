//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/codec-protobuf';

import partyProtobuf from './party';
import authProtobuf from './auth';

export const partyCodec = new Codec({ rootTypeUrl: '.dxos.party.SignedMessage' })
  .addJson(partyProtobuf)
  .addJson(authProtobuf)
  .build();

export const authCodec = partyCodec;

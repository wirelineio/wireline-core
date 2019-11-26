//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/codec-protobuf';
import partyProtobuf from './party';

export const partyCodec = new Codec({
  rootTypeUrl: '.dxos.party.SignedMessage'
}).addJson(partyProtobuf).build();

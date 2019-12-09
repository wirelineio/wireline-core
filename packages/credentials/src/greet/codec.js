//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/codec-protobuf';

import partyProtobuf from '../party/partyConstruction';
import greetProtobuf from './greet';

export const greeterCodec = new Codec({
  rootTypeUrl: '.dxos.greet.Message'
})
  .addJson(partyProtobuf)
  .addJson(greetProtobuf)
  .build();

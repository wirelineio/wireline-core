//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@dxos/codec-protobuf';

import partyProtobuf from '../party/partyConstruction';
import greetProtobuf from './greet';

export const greeterCodec = new Codec('.dxos.greet.Message')
  .addJson(partyProtobuf)
  .addJson(greetProtobuf)
  .build();

//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from '@wirelineio/codec-protobuf';

const schema = require('./schema.json');
const types = require('./testing/types.json');

test('encoding/decoding', () => {

  const options = {
    rootTypeUrl: '.dxos.Message'
  };

  const codec = new Codec(options)
    .addJson(schema)
    .addJson(types)
    .build();

  const messages = [
    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Mutation',
        property: 'title',
        value: 'hello world'
      }
    },
    {
      bucketId: 'bucket-2',
      payload: {
        __type_url: '.testing.Game',
        position: 'a1',
        piece: 0
      }
    }
  ];

  const buffers = messages.map(message => codec.encode(message));
  const received = buffers.map(buffer => codec.decode(buffer));
  expect(received).toEqual(messages);
});

//
// Copyright 2019 Wireline, Inc.
//

import { MessageCodec } from './codec';

const types = require('./testing/types.json');

test('encoding/decoding', () => {

  const codec = new MessageCodec().addJson(types).build();

  const messages = [
    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: 'testing.Credential',
        pubKey: 'xxx'
      }
    },
    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: 'testing.Mutation',
        property: 'title',
        value: 'hello world'
      }
    }
  ];

  const buffers = messages.map(message => codec.encode(message));
  const received = buffers.map(buffer => codec.decode(buffer));
  expect(received).toEqual(messages);
});

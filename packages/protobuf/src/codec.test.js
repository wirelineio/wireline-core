//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from './codec';

const codec = new Codec()
  .addJson(require('./testing/message.json'))
  .addJson(require('./testing/payload.json'));

test('encoding/decoding', () => {

  const sent = {
    bucketId: 'bucket-1',
    payload: [
      {
        // Nested.
        __type_url: 'testing.Message',
        bucketId: 'bucket-2',
        payload: [
          {
            __type_url: 'testing.Meta',
            version: '0.0.1'
          },
        ]
      },
      {
        __type_url: 'testing.Meta',
        version: '0.0.1'
      },
      {
        __type_url: 'testing.Data',
        value: 100
      },
      {
        __type_url: 'testing.Data',
        value: 200
      }
    ]
  };

  const buffer = codec.encode(sent, 'testing.Message');
  expect(buffer).toHaveLength(132);

  const received = codec.decode(buffer, 'testing.Message');
  expect(received).toEqual(sent);
});

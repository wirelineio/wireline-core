//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from './codec';

const codec = new Codec()
  .addJson(require('./testing/message.json'))
  .addJson(require('./testing/payload.json'))
  .build();

test('encoding/decoding', () => {

  const message = {
    __type_url: 'testing.Message',
    bucketId: 'bucket-1',
    payload: [
      {
        // Nested.
        __type_url: 'testing.Container',
        tags: ['system'],
        data: [
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

  // Encode the message.
  const buffer = codec.encode(message);
  expect(buffer).toHaveLength(132);

  {
    // Fully decode the message.
    const received = codec.decode(buffer, 'testing.Message');
    expect(received).toEqual(message);
  }

  {
    // Partially decode buffer.
    const received = codec.decode(buffer, 'testing.Message', { recursive: false });
    expect(received.bucketId).toEqual('bucket-1');
    expect(received.payload[0].type_url).toEqual('testing.Container');

    // Fully decode remaining.
    codec.decodeObject(received);
    expect(received).toEqual(message);
  }
});

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
        value: {
          boolValue: true
        }
      }
    ]
  };

  // Encode the message.
  const buffer = codec.encode(message);
  expect(buffer).toHaveLength(113);

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

  {
    // Partially decode with missing type defs.
    const { schema } = codec;
    // TODO(burdon): Fails if only 1 missing.
    delete schema.nested.testing.nested['Container'];
    delete schema.nested.testing.nested['Data'];
    delete schema.nested.testing.nested['Meta'];
    const partialCodec = new Codec().addJson(schema).build();

    const received = partialCodec.decode(buffer, 'testing.Message', { recursive: true, strict: false });
    expect(received).not.toEqual(message);

    // Fully decode remaining.
    codec.decodeObject(received);
    expect(received).toEqual(message);
  }
});

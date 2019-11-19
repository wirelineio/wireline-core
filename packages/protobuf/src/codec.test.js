//
// Copyright 2019 Wireline, Inc.
//

import { Codec } from './codec';

const codec = new Codec()
  .addJson(require('./testing/message.json'))
  .addJson(require('./testing/types.json'))
  .build();

const simple = [

  {
    __type_url: '.testing.Message',
    bucketId: 'bucket-1'
  },

  {
    __type_url: '.testing.Message',
    bucketId: 'bucket-1',
    payload: [
      {
        __type_url: '.testing.Meta',
        version: '0.0.1'
      }
    ]
  }
];

const nested = [

  {
    __type_url: '.testing.Message',
    bucketId: 'bucket-1',
    payload: [
      {
        __type_url: '.testing.Meta',
        version: '0.0.1'
      },
      {
        __type_url: '.testing.Data',
        value: {
          boolValue: true
        }
      }
    ]
  },

  {
    __type_url: '.testing.Message',
    bucketId: 'bucket-1',
    payload: [
      {
        // Nested.
        __type_url: '.testing.Container',
        tags: ['system'],
        data: [
          {
            __type_url: '.testing.Meta',
            version: '0.0.1'
          },
        ]
      }
    ]
  },

  {
    __type_url: '.testing.Message',
    bucketId: 'bucket-1',
    payload: [
      {
        // Nested.
        __type_url: '.testing.Container',
        tags: ['system'],
        data: [
          {
            __type_url: '.testing.Meta',
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
  }
];

const messages = [...simple, ...nested];

// TODO(burdon): Rename __type_url to "@type"
/* eslint camelcase: "off" */

test('types', () => {
  const type = codec.getType('.testing.Message');
  expect(type).not.toBeNull();
});

test('encoding/decoding (basic)', () => {
  const test = ((message) => {
    const buffer = codec.encode(message, '.testing.Message');
    const received = codec.decode(buffer, '.testing.Message');
    expect(received).toEqual(message);
  });

  messages.forEach(message => test(message));
});

test('encoding/decoding (ANY)', () => {
  const test = ((message) => {
    const buffer = codec.encode(message);
    const received = codec.decode(buffer, '.testing.Message');
    expect(received).toEqual(message);
  });

  messages.forEach(message => test(message));
});

test('encoding/decoding (nested)', () => {
  const test = ((message) => {
    const buffer = codec.encode(message);
    const received = codec.decode(buffer, '.testing.Message');
    expect(received).toEqual(message);
  });

  messages.forEach(message => test(message));
});

test('encoding/decoding (non-recursive)', () => {
  const test = ((message) => {
    const buffer = codec.encode(message);

    // Partially decode buffer.
    const received = codec.decode(buffer, '.testing.Message', { recursive: false });
    expect(received.bucketId).toEqual('bucket-1');

    received.payload.forEach(({ type_url, value }) => {
      expect(type_url).not.toBeNull();
      expect(value).not.toBeNull();
    });

    // Fully decode remaining.
    codec.decodeObject(received);
    expect(received).toEqual(message);
  });

  nested.forEach(message => test(message));
});

test('encoding/decoding (missing type)', () => {
  const test = ((message) => {
    const buffer = codec.encode(message);

    // Partially decode with missing type defs.
    const { schema } = codec;
    delete schema.nested.testing.nested['Data'];
    const partialCodec = new Codec().addJson(schema).build();

    const received = partialCodec.decode(buffer, '.testing.Message', { recursive: true, strict: false });
    expect(received).not.toEqual(message);

    // Fully decode remaining.
    codec.decodeObject(received);
    expect(received).toEqual(message);
  });

  [nested[0]].forEach(message => test(message));
});

//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';

import { Codec } from '@wirelineio/protobuf-any';

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

  const { publicKey } = crypto.keyPair();

  const messages = [
    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Credential',
        publicKey: publicKey.toString('hex')
      }
    },

    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Mutation',
        property: 'title',
        value: 'hello world'
      }
    }
  ];

  const buffers = messages.map(message => codec.encode(message));
  const received = buffers.map(buffer => codec.decode(buffer));
  expect(received).toEqual(messages);
});

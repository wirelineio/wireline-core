//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';

import { MessageCodec } from './codec';

const types = require('./testing/types.json');

test('encoding/decoding', () => {

  const codec = new MessageCodec().addJson(types).build();

  const { publicKey } = crypto.keyPair();

  const messages = [
    {
      __type_url: '.dxos.Message',
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Credential',
        publicKey: publicKey.toString('hex')
      }
    },

    {
      __type_url: '.dxos.Message',
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

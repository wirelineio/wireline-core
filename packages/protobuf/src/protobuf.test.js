//
// Copyright 2019 Wireline, Inc.
//

import { TypeFactory } from './protobuf';

const typeFactory = new TypeFactory().parse(require('./testing/test.json'));

test('encoding/decoding', () => {

  const sent = {
    bucketId: 'bucket-1',
    payload: [
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

  const buffer = typeFactory.encode('testing.Message', sent);
  expect(buffer).toHaveLength(76);

  const received = typeFactory.decode('testing.Message', buffer);
  expect(received).toEqual(sent);
});

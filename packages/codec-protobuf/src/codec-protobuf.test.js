//
// Copyright 2019 Wireline, Inc.
//

const codecProtobuf = require('./codec-protobuf');

const schema = require('./testing/example.js');

test('encode/decode test schema', () => {
  expect.assertions(3);

  const codec = codecProtobuf(schema);

  const send = { subject: 'hi', body: Buffer.from('how are you?') };
  const buffer = codec.encode({ type: 'Message', message: send });
  expect(Buffer.isBuffer(buffer)).toBe(true);

  const receive = codec.decode(buffer);
  expect(receive).toEqual(send);
  expect(Buffer.isBuffer(receive.body)).toBe(true);
});

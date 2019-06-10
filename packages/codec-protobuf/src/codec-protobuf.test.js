const codecProtobuf = require('./codec-protobuf');

const schema = require('./schema-test.js');

test('encode/decode message', () => {
  expect.assertions(3);

  const codec = codecProtobuf(schema);

  const message = { subject: 'hi', body: Buffer.from('how are you?') };

  const buffer = codec.encode({ type: 'Message', message });

  expect(Buffer.isBuffer(buffer)).toBe(true);

  const messageDecoded = codec.decode(buffer);

  expect(messageDecoded).toEqual(message);
  expect(Buffer.isBuffer(messageDecoded.body)).toBe(true);
});

const protobuf = require('protobufjs');

const codecProtobuf = require('./codec-protobuf');

const schema = require('./test.json');

test('encode/decode message', () => {
  expect.assertions(2);

  const codec = codecProtobuf(protobuf.Root.fromJSON(schema));

  const message = { subject: 'hi', body: Buffer.from('how are you?') };

  const buffer = codec.encode({ type: 'Message', message });

  expect(Buffer.isBuffer(buffer)).toBe(true);

  const messageDecoded = codec.decode(buffer);

  expect(messageDecoded).toEqual(message);
});

const protobufjs = require('protobufjs');

const Codec = require('./codec-protobuf');

const schemaOne = require('./schema-test-one.json');

test('encode/decode message', async () => {
  const codec = new Codec({ verify: true });

  const testMessage = (type) => {
    const message = { subject: 'hi', body: Buffer.from('how are you?') };

    const buffer = codec.encode({ type, message });

    expect(Buffer.isBuffer(buffer)).toBe(true);

    const messageDecoded = codec.decode(buffer);

    expect(messageDecoded).toEqual(message);
    expect(Buffer.isBuffer(messageDecoded.body)).toBe(true);
  };

  expect.assertions(6);

  // Load from a protobufjs root.
  codec.load(await protobufjs.load(`${__dirname}/schema-test-two.proto`));

  // Load from JSON.
  codec.loadFromJSON(schemaOne);

  testMessage('MessageOne');
  testMessage('MessageTwo');
});

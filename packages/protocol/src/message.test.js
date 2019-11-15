//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Add javadoc to module.
import CodecProtobuf from '@dxos/codec-protobuf';

import schema from './schema';

test('message validation', async () => {

  const codec = new CodecProtobuf({ verify: true });
  codec.loadFromJSON(schema);

  const message1 = {
    typeId: 1,
    bucketId: 1,

    // TODO(burdon): Encode/decode inner messages?
    payload: {
    }
  };

  // TODO(burdon): Test encode inner class.
  const bytes = codec.encode({ type: 'protocol.Message', message: message1 });
  const { type, message: message2 } = codec.decode(bytes);

  expect(type).toEqual('protocol.Message');
  expect(message2).toEqual(message1);
});

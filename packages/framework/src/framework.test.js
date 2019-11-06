//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

const Framework = require('./framework');

// Clean-up
// TODO(burdon): Move to 20th Century import syntax.
// TODO(burdon): Remove dependencies on ENV.
// TODO(burdon): Break Framework into separate pieces? (DxOS)
// TODO(burdon): How to coordinate changes (list other dependent repos).
// TODO(burdon): Test end-to-end replication.

// Design
// TODO(burdon): Layers.
// TODO(burdon): Multi-device support.
// TODO(burdon): Test CRDT plugin-framework (e.g., YJS, Kanban ObjectModel).
// TODO(burdon): Credentials.

test('basic test', async () => {
  const { publicKey: partyKey } = crypto.keyPair();

  // TODO(burdon): Move createSwarm.
  const framework = new Framework({

    // TODO(burdon): Username does not depend here.
    name: 'peer1',

    // TODO(burdon): Support multiple parties.
    partyKey
  });

  // framework.connect(partyKey);

  // TODO(burdon): Test views.
  expect(framework.id).not.toBeNull();
});

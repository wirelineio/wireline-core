//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

const Framework = require('./framework');

// TODO(burdon): Move to 20th Century import syntax.
// TODO(burdon): Test end-to-end replication.
// TODO(burdon): Test CRDT plugin-framework (e.g., YJS, Kanban ObjectModel).
// TODO(burdon): How to coordinate changes (list other dependent repos).
// TODO(burdon): Break Framework into separate pieces?
// TODO(burdon): Multi-device support.
// TODO(burdon): Remove dependencies on ENV.

test('basic test', async () => {
  const { publicKey: partyKey } = crypto.keyPair();

  // TODO(burdon): Move createSwarm.
  const framework = new Framework({

    // TODO(burdon): Username does not depend here.
    name: 'peer1',

    // TODO(burdon): Support multiple parties.
    partyKey
  });

  // TODO(burdon): Test views.
  expect(framework.id).not.toBeNull();
});

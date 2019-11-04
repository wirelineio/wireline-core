//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

// TODO(burdon): Move to 20th Century syntax.
const Framework = require('./framework');

// TODO(burdon): Test end-to-end replication.
// TODO(burdon): Test CRDT plugin-framework (e.g., YJS, Kanban ObjectModel).

test('basic test', async () => {
  const { publicKey: partyKey } = crypto.keyPair();

  // TODO(burdon): Move createSwarm.
  const framework = new Framework({
    name: 'peer1',

    // TODO(burdon): Support multiple parties.
    partyKey
  });

  // TODO(burdon): Test views.
  expect(framework.id).not.toBeNull();
});

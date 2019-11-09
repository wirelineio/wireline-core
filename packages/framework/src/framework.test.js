//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');
const randomAccessMemory = require('random-access-memory');

// TODO(burdon): Why?
const swarm = require('@wirelineio/discovery-swarm-memory').default;

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

  // TODO(burdon): List all modules that depend on Framework.

  const framework = new Framework({

    storage: randomAccessMemory,

    swarm,

    // TODO(burdon): Username does not depend here.
    name: 'peer1',

    // TODO(burdon): Remove and call connect instead.
    partyKey
  });

  expect(framework.id).not.toBeNull();

  // TODO(burdon): ERROR: Cannot read property '_cookieJar' of null
  await framework.initialize();

  // TODO(burdon): Test views.

  // framework.connect(partyKey);
});

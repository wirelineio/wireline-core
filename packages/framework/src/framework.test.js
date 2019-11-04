//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');

// TODO(burdon): Move to 20th Century syntax.
const Framework = require('./framework');

test('basic test', async () => {

  const { publicKey: partyKey } = crypto.keyPair();

  // TODO(burdon): Move createSwarm.
  const framework = new Framework({
    partyKey,
    name: 'peer1'
  });

  expect(framework.id).not.toBeNull();
});

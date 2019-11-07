/**
 * @jest-environment node
 */

const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');
const waitForExpect = require('wait-for-expect');

const swarm = require('@wirelineio/discovery-swarm-memory').default;
const { Presence } = require('@wirelineio/protocol');

const Framework = require('./framework');

async function createPeer(name, partyKey) {
  const keys = crypto.keyPair();
  const presence = new Presence(keys.publicKey);

  const framework = new Framework({
    name,
    partyKey,
    keys,
    swarm,
    storage: ram,
    extensions: [() => presence.createExtension()]
  });

  await framework.initialize();

  return { framework, presence };
}

describe('testing 2 peers using the chat view', () => {
  const partyKey = crypto.randomBytes(32);

  test('create peers', async () => {
    const alice = await createPeer('alice', partyKey);
    const bob = await createPeer('bob', partyKey);

    await waitForExpect(() => {
      expect(alice.presence.peers.length).toBe(2);
      expect(bob.presence.peers.length).toBe(2);
    });
  });
});

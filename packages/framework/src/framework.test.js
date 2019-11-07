/**
 * @jest-environment node
 */

const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');
const waitForExpect = require('wait-for-expect');

const swarm = require('@wirelineio/discovery-swarm-memory');
const { Presence } = require('@wirelineio/protocol');

const Framework = require('./framework');

async function createPeer(name, partyKey) {
  const keys = crypto.keyPair();
  const presence = new Presence(keys.publicKey);
  const peers = new Set();

  const framework = new Framework({
    name,
    partyKey,
    keys,
    swarm,
    storage: ram,
    extensions: [() => presence.createExtension()]
  });

  framework.on('metric.swarm.connection-open', (_, peer) => {
    peers.add(peer);
  });

  framework.on('metric.swarm.connection-closed', (_, peer) => {
    peers.delete(peer);
  });

  await framework.initialize();

  return { framework, presence, peers };
}

describe('testing 2 peers using the chat view', () => {
  const partyKey = crypto.randomBytes(32);
  let alice;
  let bob;

  test('create peers', async () => {
    alice = await createPeer('alice', partyKey);
    bob = await createPeer('bob', partyKey);

    expect(alice.framework).toBeInstanceOf(Framework);
    expect(bob.framework).toBeInstanceOf(Framework);
  });

  test('register chat view', async () => {
    alice.framework.viewManager.registerView({ name: 'chat', view: 'ChatLogsView' });
    bob.framework.viewManager.registerView({ name: 'chat', view: 'ChatLogsView' });

    expect(alice.framework.kappa.api['chat']).toBeDefined();
    expect(bob.framework.kappa.api['chat']).toBeDefined();
  });


  // TODO: missing check chat working.

  test('protocol connectivity', async () => {
    await waitForExpect(() => {
      expect(alice.peers.size).toBe(1);
      expect(bob.peers.size).toBe(1);
    });
  });

  // TODO: missing check presence connectivity.

  test('disconnection', async () => {
    alice.framework.disconnect(partyKey);
    bob.framework.disconnect(partyKey);

    await waitForExpect(() => {
      expect(alice.peers.size).toBe(0);
      expect(bob.peers.size).toBe(0);
    });
  });

  afterAll(async () => {
    await Promise.all([
      alice.presence.stop(),
      bob.presence.stop()
    ]);
  });
});

//
// Copyright 2019 Wireline, Inc.
//

/* eslint-disable */ 

const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');
const waitForExpect = require('wait-for-expect');
const ngPath = require('ngraph.path');

const swarm = require('@wirelineio/discovery-swarm-memory');
const { Presence } = require('@wirelineio/protocol');

const Framework = require('./framework');

async function createPeer(partyKey, name) {
  const keys = crypto.keyPair();
  const presence = new Presence(keys.publicKey);
  const peers = new Set();

  const framework = new Framework({
    keys,
    swarm,
    storage: ram,
    extensions: [() => presence.createExtension()],

    // TODO(burdon): Remove initial party and username.
    partyKey,
    name,
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

// TODO(burdon): Explain data structure. Rename "changes".
async function getMessages(messages) {
  return (await messages)
    .map(message => message.data.changes)
    .map(messages => messages[0]);
}

describe('testing 2 peers using the log view', () => {
  const partyKey = crypto.randomBytes(32);

  let peer1;
  let peer2;

  test('create peers', async () => {
    peer1 = await createPeer(partyKey, 'peer1');
    peer2 = await createPeer(partyKey, 'peer2');

    expect(peer1.framework).toBeInstanceOf(Framework);
    expect(peer2.framework).toBeInstanceOf(Framework);
  });

  test('register chat view', async () => {
    peer1.framework.viewManager.registerView({ name: 'log', view: 'LogsView' });
    peer2.framework.viewManager.registerView({ name: 'log', view: 'LogsView' });

    expect(peer1.framework.kappa.api['log']).toBeDefined();
    expect(peer2.framework.kappa.api['log']).toBeDefined();
  });

  // TODO(telackey): Needs party construction under the new replication regime.
  
  //  test('replication data', async () => {
  //    const peerLog1 = peer1.framework.kappa.api['log'];
  //    const peerLog2 = peer2.framework.kappa.api['log'];
  //
  //    const title = 'messages';
  //    const { itemId } = await peerLog1.create({ type: 'log', title });
  //
  //    await waitForExpect(async () => {
  //      return Promise.all([
  //        expect(peerLog1.getById(itemId)).resolves.toHaveProperty('title', title),
  //        expect(peerLog2.getById(itemId)).resolves.toHaveProperty('title', title)
  //      ]);
  //    });
  //
  //    await peerLog1.appendChange(itemId, ['msg1']);
  //    await peerLog2.appendChange(itemId, ['msg2']);
  //
  //    await waitForExpect(async () => {
  //      return Promise.all([
  //        expect(getMessages(peerLog1.getChanges(itemId))).resolves.toEqual(['msg1', 'msg2']),
  //        expect(getMessages(peerLog1.getChanges(itemId))).resolves.toEqual(['msg1', 'msg2'])
  //      ]);
  //    });
  //  });

  test('protocol connectivity', async () => {
    await waitForExpect(() => {
      expect(peer1.peers.size).toBe(1);
      expect(peer2.peers.size).toBe(1);
    });
  });

  test('presence connectivity', async () => {
    const pathFinder1 = ngPath.aStar(peer1.presence.network);
    const pathFinder2 = ngPath.aStar(peer2.presence.network);
    const id1 = peer1.framework.id.toString('hex');
    const id2 = peer2.framework.id.toString('hex');

    await waitForExpect(() => {
      expect(pathFinder1.find(id1, id2).length).toBeGreaterThan(0);
      expect(pathFinder2.find(id2, id1).length).toBeGreaterThan(0);
    });
  });

  test('disconnection', async () => {
    peer1.framework.disconnect(partyKey);
    peer2.framework.disconnect(partyKey);

    await waitForExpect(() => {
      expect(peer1.peers.size).toBe(0);
      expect(peer2.peers.size).toBe(0);
    });
  });

  afterAll(async () => {
    await Promise.all([
      peer1.presence.stop(),
      peer2.presence.stop()
    ]);
  });
});

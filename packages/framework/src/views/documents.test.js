//
// Copyright 2019 Wireline, Inc.
//

const randomAccessMemory = require('random-access-memory');
const crypto = require('hypercore-crypto');

const swarm = require('@wirelineio/discovery-swarm-memory').default;

const Framework = require('../framework');

const createFramework = async ({ keys, partyKey, name, isBot = false }) => {

  const framework = new Framework({
    isBot,
    storage: randomAccessMemory,
    swarm,
    keys,
    partyKey,
    name
  });

  // Initialize control feed, swarm and set the initial party connection based on conf.partyKey.
  await framework.initialize();

  //   // Load initial feeds for the currentPartyKey. Default is to lazy load feeds on connection.
  //   await framework.mega.loadFeeds([
  //     'control-feed/*',
  //     `party-feed/${partyKey.toString('hex')}/*`
  //   ]);
  // }

  return framework;
};

const createPartyPeers = async (partyKey, peersCount = 1) => {
  const peers = [];
  for (const i of Array.from({ length: peersCount })) {
    const keys = crypto.keyPair();
    const framework = await createFramework({ keys, partyKey, name: `peer-${i}` });
    peers.push({ framework });
  }

  return peers;
};

describe('views.document', () => {
  let framework;
  let partyKey;

  beforeEach(async () => {
    partyKey = crypto.keyPair().publicKey;
    const keys = crypto.keyPair();
    const name = 'owner';
    framework = await createFramework({ keys, partyKey, name });
  });

  it('creates a document item', async () => {
    const title = 'Creation test doc';
    const item = await framework.kappa.api.documents.create({ type: 'documents', title  });

    expect(item).toBeDefined();
    expect(item.itemId).toBeDefined();
    expect(item.title).toBe(title);
  });

  it('sync doc creation with a peer', async () => {
    const title = 'Sync doc test doc';
    const peers = await createPartyPeers(partyKey);

    const item = await framework.kappa.api.documents.create({ type: 'documents', title  });

    // Wait for doc indexing on kappa view.
    await new Promise(resolve => setTimeout(() => resolve(), 100));

    const peerItem = await peers[0].framework.kappa.api.documents.getById(item.itemId);

    expect(peerItem).toBeDefined();
    expect(peerItem.itemId).toBeDefined();
    expect(peerItem.title).toBe(title);

  });

  it('triggers doc change event on peer', () => {

  });
});

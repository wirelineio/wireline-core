//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import ram from 'random-access-memory';
import crypto from 'hypercore-crypto';

import network from '@wirelineio/hyperswarm-network-memory';

import { latch } from './util';
import { Node } from './node';
import { createKeys, Megafeed } from './megafeed';
import { AuthProvider } from './credentials';

const log = debug('test');

debug.enable('test,node,messenger,protocol,extension');

const [ rendezvousKey ] = createKeys(1);

// TODO(ashwin): Temporarily commenting test- see TODO below.
test.skip('broadcast messages between nodes', async (done) => {

  const authProvider1 = new AuthProvider(crypto.keyPair());
  const authProvider2 = new AuthProvider(crypto.keyPair());

  const node1 = new Node(network(), await Megafeed.create(ram, { authProvider: authProvider1 })).joinSwarm(rendezvousKey);
  const node2 = new Node(network(), await Megafeed.create(ram, { authProvider: authProvider2 })).joinSwarm(rendezvousKey);

  const onHandshake = latch(2, async () => {
    log(String(node1));
    log(String(node2));

    // TODO(burdon): Fails if the messenger extension is not declared first (in Node).
    const ack = await node1.broadcastMessage({ type: 'ping' });
    log('%o', ack);

    done();
  });

  node1.once('handshake', onHandshake);
  node2.once('handshake', onHandshake);
});

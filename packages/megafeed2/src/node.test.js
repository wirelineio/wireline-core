//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import network from '@wirelineio/hyperswarm-network-memory';

import { latch } from './util';
import { Node } from './node';
import { createKeys, Megafeed } from './megafeed';

const log = debug('test');

debug.enable('test,node,messenger,protocol,extension');

const [ rendezvousKey ] = createKeys(1);

test('broadcast messages between nodes', async (done) => {

  const node1 = new Node(network(), await Megafeed.create({ replicate: false })).joinSwarm(rendezvousKey);
  const node2 = new Node(network(), await Megafeed.create({ replicate: false })).joinSwarm(rendezvousKey);

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

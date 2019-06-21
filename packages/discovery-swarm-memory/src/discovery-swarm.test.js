//
// Copyright 2019 Wireline, Inc.
//

import pify from 'pify';
import hypercore from 'hypercore';
import ram from 'random-access-memory';
import DiscoverySwarm from './discovery-swarm';

test('replicate using discovery-swarm and hypercore', async (done) => {
  const localFeed = hypercore(ram, { valueEncoding: 'utf-8' });

  await pify(localFeed.ready.bind(localFeed))();

  const replicaFeed = hypercore(ram, localFeed.key, { valueEncoding: 'utf-8' });
  replicaFeed.on('append', () => {
    replicaFeed.head((err, message) => {
      expect(message).toBe('hello');
      done();
    });
  });

  const swarms = [
    new DiscoverySwarm({
      stream: () => localFeed.replicate({ live: true })
    }),
    new DiscoverySwarm({
      stream: () => replicaFeed.replicate({ live: true })
    })
  ];

  swarms.forEach(swarm => swarm.join('test'));

  localFeed.append('hello');
});

//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import path from 'path';
import waitForExpect from 'wait-for-expect';

import { createKeys } from '@wirelineio/megafeed';

import { random } from '../util/debug';
import { createCodec } from '../util/codec';
import { keyStr } from '../util';

import { ChessApp } from './chess';
import { createChessApps, createPeer, playGameMoves } from './helpers';

debug.enable('test,chess');

const TEST_TIMEOUT = 50 * 1000;

jest.setTimeout(TEST_TIMEOUT);

const log = debug('test');

test('simultaneous chess games between peers', async (done) => {
  const numPeers = 10;
  const numGames = 25;

  // Topic used to find peers interested in chess games.
  const [ gameTopic ] = createKeys(1);

  // Used to set identity of white/black side in each game.
  const peerKeys = createKeys(numPeers);

  const codec = await createCodec([
    path.join(__dirname, 'item.proto'),
    path.join(__dirname, 'chess.proto')
  ]);

  // Passed from router (or stored in the feed and referenced by a view ID).
  const params = {
    topic: keyStr(gameTopic),
    type: ChessApp.TYPE,
  };

  // Create peers.
  const peers = await Promise.all([...Array(numPeers).keys()].map(async i => {
    const { feed, view } = await createPeer(params, gameTopic, codec);
    return { feed, view, key: peerKeys[i] };
  }));

  // Create games between randomly chosen peers.
  const games = [];
  for (let i = 0; i < numGames; i++) {
    const peer1 = random.pickone(peers);
    const peer2 = random.pickone(peers.filter(peer => peer !== peer1));

    // Create item and chess apps.
    const itemId = random.word({ length: 16 });
    const { app1, app2 } = createChessApps(itemId, peer1, peer2);
    games.push({ app1, app2 });

    // Peer1 is White, Peer2 is Black.
    await app1.createGame({
      white: keyStr(peer1.key),
      black: keyStr(peer2.key)
    });

    // Start playing moves on a timer.
    playGameMoves(app1, app2);
  }

  await waitForExpect(async() => {
    games.forEach(({ app1, app2 }) => {
      // Both sides should finally sync.
      expect(app1.gameOver).toBeTruthy();
      expect(app2.gameOver).toBeTruthy();
      expect(app1.position).toEqual(app2.position);
    });

    games.forEach(({ app1 }) => {
      log('Position: [', app1.position, '] Result:', app1.result);
    });

    done();
  }, TEST_TIMEOUT);
});

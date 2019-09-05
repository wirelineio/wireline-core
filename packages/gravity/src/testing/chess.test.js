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

const TEST_TIMEOUT = 100 * 1000;

jest.setTimeout(TEST_TIMEOUT);

const log = debug('test');

test('simultaneous chess games between peers', async (done) => {
  const numGames = 25;
  const numPeers = 5;

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
  let games = [];
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
    games = games.filter(({ app1, app2 }) => {
      log(`A1 ${app1._itemId} Position: [${app1.position}] Result: ${app1.result}`);
      log(`A2 ${app2._itemId} Position: [${app2.position}] Result: ${app2.result}`);

      if (app1.gameOver && app2.gameOver && (app1.position === app2.position)) {
        log(`Game ${app1._itemId} over and matched!`);
        return false;
      }
      return true;
    });

    log(`${games.length} games still playing.`);

    expect(games.length).toEqual(0);

    done();
  }, TEST_TIMEOUT);
});

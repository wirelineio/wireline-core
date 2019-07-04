//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import fs from 'fs';
import path from 'path';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';
import { Chess } from 'chess.js';

import network from '@wirelineio/hyperswarm-network-memory';

import { ViewFactory } from '../megafeed/view_factory';
import { createFeedMap, createKeys, Megafeed } from '../megafeed';
import { keyStr } from '../util';
import { Node } from '../node';

import { LogView } from './log_view';
import { ChessApp, ChessStateMachine } from './chess';

const log = debug('test');

debug.enable('test');

const [ topicKey, gameTopic ] = createKeys(2);
const [ whitePlayerKey, blackPlayerKey ] = createKeys(2);

const TEST_TIMEOUT = 15 * 1000;

jest.setTimeout(TEST_TIMEOUT);

const loadSampleGameMoves = () => {
  const chess = new Chess();
  chess.load_pgn(fs.readFileSync(path.join(__dirname, 'data/immortal.pgn'), 'utf8'));

  let seq = 0;

  return chess.history({ verbose: true }).map(move => {
    return {
      seq: seq++,
      from: move.from,
      to: move.to
    }
  });
};

test('chess', async (done) => {
  const numFeedsPerTopic = 1;

  // Passed from router (or stored in the feed and referenced by a view ID).
  const params = {
    topic: keyStr(gameTopic),
    type: ChessApp.TYPE,
    itemId: 'game1'
  };

  const map1 = new Map();
  const map2 = new Map();

  const feedMap1 = await createFeedMap({ map: map1, topicKeys: [ gameTopic ], numFeedsPerTopic });
  const megafeed1 = new Megafeed(feedMap1);

  const feedMap2 = await createFeedMap({ map: map2, topicKeys: [ gameTopic ], numFeedsPerTopic });
  const megafeed2 = new Megafeed(feedMap2);

  const node1 = new Node(network(), megafeed1).joinSwarm(topicKey);
  const node2 = new Node(network(), megafeed2).joinSwarm(topicKey);

  const [{ feed: feed1 }] = Array.from(map1.values());
  const [{ feed: feed2 }] = Array.from(map2.values());

  let app1;
  let app2;

  // Create app1.
  {
    const viewFactory1 = new ViewFactory(ram, feedMap1);
    const kappa1 = await viewFactory1.getOrCreate('view1', params.topic);
    kappa1.use('log', LogView(params.type));

    const view1 = kappa1.api['log'];
    app1 = new ChessApp(feed1, view1, params.itemId);
  }

  // Create app2.
  {
    const viewFactory2 = new ViewFactory(ram, feedMap2);
    const kappa2 = await viewFactory2.getOrCreate('view1', params.topic);
    kappa2.use('log', LogView(params.type));

    const view2 = kappa2.api['log'];
    app2 = new ChessApp(feed2, view2, params.itemId);
  }

  {
    // Create game.
    await app1.createGame(keyStr(whitePlayerKey), keyStr(blackPlayerKey));
  }

  // Load sample game with lots of moves.
  const gameMoves = loadSampleGameMoves();

  // Players take turns playing their moves.
  {
    let moveNum = 0;
    const timer = setInterval(async () => {
      if (moveNum >= gameMoves.length) {
        return clearInterval(timer);
      }

      const app = (moveNum % 2 === 0 ? app1 : app2);
      await app.addMove(gameMoves[moveNum++]);
      log('Played move', moveNum, 'of', gameMoves.length);
    },100);
  }

  // TODO(burdon): Wait for event?
  waitForExpect(async() => {

    expect(app1.getPlayerKey(ChessStateMachine.WHITE)).toBe(keyStr(whitePlayerKey));
    expect(app2.getPlayerKey(ChessStateMachine.WHITE)).toBe(keyStr(whitePlayerKey));

    expect(app1.getPlayerKey(ChessStateMachine.BLACK)).toBe(keyStr(blackPlayerKey));
    expect(app2.getPlayerKey(ChessStateMachine.BLACK)).toBe(keyStr(blackPlayerKey));

    expect(app1.moves).toEqual(gameMoves);
    expect(app2.moves).toEqual(gameMoves);

    expect(app1.position).toBe(app2.position);

    node1.leaveSwarm();
    node2.leaveSwarm();

    done();
  }, TEST_TIMEOUT);
});

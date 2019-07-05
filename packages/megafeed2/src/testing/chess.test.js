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
import { random } from '../util/debug';
import { createFeedStore, createKeys, Megafeed } from '../megafeed';
import { keyStr } from '../util';
import { Node } from '../node';

import { LogView } from './log_view';
import { ChessApp } from './chess';

debug.enable('test,chess');

const numPeers = 10;
const numGames = 25;

const [ gameTopic ] = createKeys(1);
const peerKeys = createKeys(numPeers);

const TEST_TIMEOUT = 25 * 1000;

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

// Load sample game with lots of moves.
// "The Immortal Game" (http://www.chessgames.com/perl/chessgame?gid=1018910).
const gameMoves = loadSampleGameMoves();

const createChessApps = (itemId, peer1, peer2) => {
  const { feed: feed1, view: view1 } = peer1;
  const { feed: feed2, view: view2 } = peer2;

  const app1 = new ChessApp(feed1, view1, itemId);
  const app2 = new ChessApp(feed2, view2, itemId);

  return {
    app1,
    app2
  };
};

const playGameMoves = (app1, app2) => {
  // Players take turns playing their moves.
  let moveNum = 0;
  const timer = setInterval(async () => {
    if (moveNum >= gameMoves.length) {
      return clearInterval(timer);
    }

    const app = (moveNum % 2 === 0 ? app1 : app2);
    await app.addMove(gameMoves[moveNum++]);
  }, random.integer({
    min: 10,
    max: 250
  }));
};

const createPeer = async (params) => {
  const feedStore = await createFeedStore({
    topicKeys: [gameTopic],
    numFeedsPerTopic: 1
  });

  const megafeed = new Megafeed(feedStore);
  new Node(network(), megafeed).joinSwarm(gameTopic);

  const viewFactory = new ViewFactory(ram, feedStore);
  const kappa = await viewFactory.getOrCreateView('gamesView', params.topic);
  kappa.use('log', LogView(params.type));

  // Peer info we'll need later for chess games.
  const [feed] = await feedStore.getFeeds();
  const view = kappa.api['log'];

  return {
    feed,
    view
  };
};

test('chess', async (done) => {

  // Passed from router (or stored in the feed and referenced by a view ID).
  const params = {
    topic: keyStr(gameTopic),
    type: ChessApp.TYPE,
  };

  const peers = [];
  const apps = [];

  // Create peers.
  for (let i = 0; i < numPeers; i++) {
    const { feed, view } = await createPeer(params);
    peers.push({ feed, view, peerKey: peerKeys[i] });
  }

  // Create game between randomly chosen peers.
  for (let i = 0; i < numGames; i++) {
    const peer1 = random.pickone(peers);
    const peer2 = random.pickone(peers);

    // Create item and chess apps.
    const itemId = random.word({ length: 16 });
    const { app1, app2 } = createChessApps(itemId, peer1, peer2);

    // Peer1 is White, Peer2 is Black.
    await app1.createGame({
      whitePlayerKey: keyStr(peer1.peerKey),
      blackPlayerKey: keyStr(peer2.peerKey)
    });

    apps.push(app1);
    apps.push(app2);

    // Start playing moves on a timer.
    playGameMoves(app1, app2);
  }

  // TODO(burdon): Wait for event?
  waitForExpect(async() => {
    apps.forEach(app => {
      // All app instances should finally sync.
      expect(app.moves).toEqual(gameMoves);
    });

    done();
  }, TEST_TIMEOUT);
});

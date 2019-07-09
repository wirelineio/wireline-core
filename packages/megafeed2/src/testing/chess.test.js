//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import path from 'path';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';
import protobufjs from 'protobufjs';

import Codec from '@wirelineio/codec-protobuf';
import network from '@wirelineio/hyperswarm-network-memory';

import { ViewFactory } from '../megafeed/view_factory';
import { random } from '../util/debug';
import { createKeys, createMegafeed } from '../megafeed';
import { keyStr } from '../util';
import { Node } from '../node';

import { LogView } from './log_view';
import { ChessApp } from './chess';

debug.enable('test,chess');

const TEST_TIMEOUT = 25 * 1000;

jest.setTimeout(TEST_TIMEOUT);


/**
 * Create chess apps for the given itemId.
 * @param {String} itemId
 * @param {Object} peer1
 * @param {Object} peer2
 * @param {Codec} codec
 * @returns {{app2: ChessApp, app1: ChessApp}}
 */
const createChessApps = (itemId, peer1, peer2, codec) => {
  const { feed: feed1, view: view1 } = peer1;
  const { feed: feed2, view: view2 } = peer2;

  const app1 = new ChessApp(feed1, view1, itemId, codec);
  const app2 = new ChessApp(feed2, view2, itemId, codec);

  return {
    app1,
    app2
  };
};

/**
 * Play game moves on a timer.
 * @param {ChessApp} app1
 * @param {ChessApp} app2
 */
const playGameMoves = (app1, app2) => {
  // Players take turns playing their moves.
  let seq = 0;
  const timer = setInterval(async () => {
    if (app1.gameOver && app2.gameOver) {
      return clearInterval(timer);
    }

    const app = (seq % 2 === 0 ? app1 : app2);
    // Move only if it's your turn.
    if (app.nextMoveNum === seq) {
      await app.playMove();
      seq++;
    }
  }, random.integer({
    min: 10,
    max: 50
  }));
};

/**
 * Create a peer.
 * @param {Object} params
 * @param {Object} gameTopic
 * @param {Codec} codec
 * @returns {Promise<{feed, view: *}>}
 */
const createPeer = async (params, gameTopic, codec) => {
  const megafeed = await createMegafeed({
    topicKeys: [gameTopic],
    numFeedsPerTopic: 1,
    valueEncoding: 'binary'
  });

  new Node(network(), megafeed).joinSwarm(gameTopic);

  const viewFactory = new ViewFactory(ram, megafeed.feedStore);
  const kappa = await viewFactory.getOrCreateView('games', params.topic);
  kappa.use('log', LogView(params.type, codec));

  // Peer info we'll need later for chess games.
  const [ feed ] = await megafeed.feedStore.getFeeds();
  const view = kappa.api['log'];

  return {
    feed,
    view
  };
};

test('simultaneous chess games between peers', async (done) => {
  const numPeers = 10;
  const numGames = 25;

  // Topic used to find peers interested in chess games.
  const [ gameTopic ] = createKeys(1);

  // Used to set identity of white/black side in each game.
  const peerKeys = createKeys(numPeers);

  const codec = new Codec({ verify: true });

  codec.load(await protobufjs.load(path.join(__dirname, 'item.proto')));
  codec.load(await protobufjs.load(path.join(__dirname, 'chess.proto')));

  // Passed from router (or stored in the feed and referenced by a view ID).
  const params = {
    topic: keyStr(gameTopic),
    type: ChessApp.TYPE,
  };

  const peers = [];
  const apps = [];
  let games = [];

  // Create peers.
  for (let i = 0; i < numPeers; i++) {
    const { feed, view } = await createPeer(params, gameTopic, codec);
    peers.push({ feed, view, key: peerKeys[i] });
  }

  // Create games between randomly chosen peers.
  for (let i = 0; i < numGames; i++) {
    const peer1 = random.pickone(peers);
    const peer2 = random.pickone(peers);

    // Create item and chess apps.
    const itemId = random.word({ length: 16 });
    const { app1, app2 } = createChessApps(itemId, peer1, peer2, codec);

    // Peer1 is White, Peer2 is Black.
    await app1.createGame({
      whitePlayerKey: keyStr(peer1.key),
      blackPlayerKey: keyStr(peer2.key)
    });

    apps.push(app1);
    apps.push(app2);

    games.push({ app1, app2 });

    // Start playing moves on a timer.
    playGameMoves(app1, app2);
  }

  // TODO(burdon): Wait for event?
  await waitForExpect(async() => {
    games.forEach(({ app1, app2 }) => {
      // Both sides should finally sync.
      expect(app1.gameOver).toBeTruthy();
      expect(app2.gameOver).toBeTruthy();

      expect(app1.gameMoves).toEqual(app2.gameMoves);
      expect(app1.position).toEqual(app2.position);
    });

    done();
  }, TEST_TIMEOUT);
});

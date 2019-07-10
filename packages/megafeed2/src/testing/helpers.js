//
// Copyright 2019 Wireline, Inc.
//

import ram from 'random-access-memory';
import protobufjs from 'protobufjs';

import Codec from '@wirelineio/codec-protobuf';
import network from '@wirelineio/hyperswarm-network-memory';

import { ViewFactory } from '../megafeed/view_factory';
import { createMegafeed } from '../megafeed';
import { Node } from '../node';
import { random } from '../util';

import { LogView } from './log_view';
import { ChessApp, ChessStateMachine } from './chess';

/**
 * Create chess apps for the given itemId.
 * @param {String} itemId
 * @param {Object} peer1
 * @param {Object} peer2
 * @param {Codec} codec
 * @returns {{app2: ChessApp, app1: ChessApp}}
 */
export const createChessApps = (itemId, peer1, peer2, codec) => {
  const { feed: feed1, view: view1 } = peer1;
  const { feed: feed2, view: view2 } = peer2;

  const app1 = new ChessApp(feed1, view1, { itemId, side: ChessStateMachine.WHITE }, codec);
  const app2 = new ChessApp(feed2, view2, { itemId, side: ChessStateMachine.BLACK }, codec);

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
export const playGameMoves = (app1, app2) => {
  // Players take turns playing their moves.
  let seq = 0;
  const timer = setInterval(async () => {
    if (app1.gameOver && app2.gameOver) {
      return clearInterval(timer);
    }

    const app = (seq % 2 === 0 ? app1 : app2);
    // Move only if it's your turn.
    if (!app.gameOver && app.nextMoveNum === seq) {
      await app.playMove();
      seq++;
    }
  }, random.integer({
    min: 5,
    max: 25
  }));
};

/**
 * Create a peer.
 * @param {Object} params
 * @param {Object} gameTopic
 * @param {Codec} codec
 * @returns {Promise<{feed, view: *}>}
 */
export const createPeer = async (params, gameTopic, codec) => {
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
  const [feed] = await megafeed.feedStore.getFeeds();
  const view = kappa.api['log'];

  return {
    feed,
    view
  };
};

/**
 * Create codec from .proto files.
 * @param {[string]} paths
 * @returns {Promise<Codec>}
 */
export const createCodec = async (paths) => {
  const codec = new Codec({ verify: true });
  for (let i = 0; i < paths.length; i++) {
    codec.load(await protobufjs.load(paths[i]));
  }

  return codec;
};

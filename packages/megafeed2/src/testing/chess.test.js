//
// Copyright 2019 Wireline, Inc.
//

import pify from 'pify';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';

import network from '@wirelineio/hyperswarm-network-memory';

import { ViewFactory } from '../megafeed/view_factory';
import { Megafeed, createFeedMap, createKeys } from '../megafeed';
import { keyStr } from '../util';
import { Node } from '../node';

import { LogApp, LogView } from './log_view';

const [ rendezvousKey, gameTopic ] = createKeys(2);

test('chess', async (done) => {
  const numFeedsPerTopic = 1;

  // Passed from router (or stored in the feed and referenced by a view ID).
  const params = {
    topic: keyStr(gameTopic),
    type: 'chess',
    itemId: 'game1'
  };

  const map1 = new Map();
  const feedMap1 = await createFeedMap({ map: map1, topicKeys: [ gameTopic ], numFeedsPerTopic });
  const megafeed1 = new Megafeed(feedMap1);

  const map2 = new Map();
  const feedMap2 = await createFeedMap({ map: map2, topicKeys: [ gameTopic ], numFeedsPerTopic });
  const megafeed2 = new Megafeed(feedMap2);

  const node1 = new Node(network(), megafeed1).joinSwarm(rendezvousKey);
  const node2 = new Node(network(), megafeed2).joinSwarm(rendezvousKey);

  {
    const [{ feed: feed1 }] = Array.from(map1.values());
    const [{ feed: feed2 }] = Array.from(map2.values());

    // Chess Game 1.
    // TODO(burdon): Generate actual chess game using app.
    pify(feed1.append.bind(feed1))({ type: 'chess', itemId: 'game1', move: 'e4', seq: 1 });
    pify(feed2.append.bind(feed2))({ type: 'chess', itemId: 'game1', move: 'e5', seq: 2 });

    // Chess Game 2.
    pify(feed1.append.bind(feed1))({ type: 'chess', itemId: 'game2', move: 'd4', seq: 1 });
    pify(feed2.append.bind(feed2))({ type: 'chess', itemId: 'game2', move: 'd5', seq: 2 });
    pify(feed1.append.bind(feed1))({ type: 'chess', itemId: 'game2', move: 'e4', seq: 3 });
    pify(feed2.append.bind(feed2))({ type: 'chess', itemId: 'game2', move: 'e5', seq: 4 });
  }

  let app1;
  let app2;

  // Create app1.
  {
    const viewFactory1 = new ViewFactory(ram, feedMap1);
    const kappa1 = await viewFactory1.getOrCreate('view1', params.topic);
    kappa1.use('log', LogView(params.type));

    const view1 = kappa1.api['log'];
    app1 = new LogApp(view1, params.itemId);
  }

  // Create app2.
  {
    const viewFactory2 = new ViewFactory(ram, feedMap2);
    const kappa2 = await viewFactory2.getOrCreate('view1', params.topic);
    kappa2.use('log', LogView(params.type));

    const view2 = kappa2.api['log'];
    app2 = new LogApp(view2, params.itemId);
  }

  // TODO(burdon): Wait for event?
  waitForExpect(async() => {
    const expectedMoves = [
      { type: 'chess', itemId: 'game1', move: 'e4', seq: 1 },
      { type: 'chess', itemId: 'game1', move: 'e5', seq: 2 }
    ];

    expect(app1.list()).toEqual(expectedMoves);
    expect(app2.list()).toEqual(expectedMoves);

    node1.leaveSwarm();
    node2.leaveSwarm();

    done();
  });
});


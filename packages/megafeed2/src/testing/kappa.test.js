//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import ram from 'random-access-memory';
import pify from 'pify';
import waitForExpect from 'wait-for-expect';

import { createFeedMap, createKeys } from '../megafeed/debug/generator'
import { ViewFactory } from '../megafeed/view_factory';
import { random } from '../util/debug';
import { keyStr, keyName } from '../util/keys';

import { LogView, LogApp } from './log_view';
import { OrderedLogView, OrderedLogApp } from './ordered_log_view';

const conf = {
  numFeeds: 3,
  numMessages: 15,
  rootParent: 'none'
};

const topicKeys = createKeys(2);
const [ topic, chatTopic ] = topicKeys.map(key => keyStr(key));

debug.enable('test');
const log = debug('test');

test('kappa with feedmap', async () => {

  // Passed from router.
  const params = {
    topic,
    type: 'chess',
    itemId: 'game1'
  };

  // Create FeedMap.
  const map = new Map();
  const feedMap = await createFeedMap({ topicKeys: [ topic ], numFeedsPerTopic: 2, map });

  // Create messages.
  const [ { feed: feed1 }, { feed: feed2 } ] = Array.from(map.values());

  // Chess Game 1.
  pify(feed1.append.bind(feed1))({ type: 'chess', itemId: 'game1', move: 'e4', seq: 1 });
  pify(feed2.append.bind(feed2))({ type: 'chess', itemId: 'game1', move: 'e5', seq: 2 });

  // Chess Game 2.
  pify(feed1.append.bind(feed1))({ type: 'chess', itemId: 'game2', move: 'e4', seq: 1 });
  pify(feed2.append.bind(feed2))({ type: 'chess', itemId: 'game2', move: 'e5', seq: 2 });

  // Docs.
  pify(feed1.append.bind(feed1))({ type: 'document', itemId: 'doc1', title: 'New Doc 1' });
  pify(feed2.append.bind(feed2))({ type: 'document', itemId: 'doc2', title: 'New Doc 2' });

  // Create view.
  const viewFactory = new ViewFactory(ram, feedMap);
  const kappa = await viewFactory.getOrCreate('view1', params.topic);
  kappa.use('log', LogView(params.type));

  // Create app from view.
  const view = kappa.api['log'];
  const app = new LogApp(view, params.itemId);

  const expectedMoves = [
    { type: 'chess', itemId: 'game1', move: 'e4', seq: 1 },
    { type: 'chess', itemId: 'game1', move: 'e5', seq: 2 }
  ];

  await waitForExpect(async () => {
    expect(app.list()).toEqual(expectedMoves);
    log('%o', app.list());
  });
});

test('kappa with message order', async () => {

  const { numMessages, numFeeds, rootParent } = conf;

  // Passed from router.
  const params = {
    topic: chatTopic,
    type: 'chat',
    itemId: `chat${random.timestamp()}`
  };

  // Create FeedMap.
  const map = new Map();
  const feedMap = await createFeedMap({ topicKeys: [ chatTopic ], numFeedsPerTopic: numFeeds, map });

  // Create messages.
  const feeds = Array.from(map.values());

  // Multiple messages from multiple feeds.
  const messages = [];
  const addMessage = (feed, seq, parentId) => {
    const messageId = random.guid();
    messages.push(messageId);

    const message = { type: 'chat', itemId: params.itemId, seq, id: messageId, text: random.sentence(), parentId: parentId || 'none', author: keyName(feed.key) };
    pify(feed.append.bind(feed))(message);

    return messageId;
  };

  for (let i = 1; i <= numMessages; i++) {
    const { feed } = random.pickone(feeds);
    const parentId = messages.length ? random.pickone(messages) : undefined;
    addMessage(feed, i, parentId);

    if (random.bool({ liklihood: 70 })) {
      const { feed: concurrentFeed } = random.pickone(feeds);
      addMessage(concurrentFeed, i, parentId);
    }
  }

  // Create view.
  const viewFactory = new ViewFactory(ram, feedMap);
  const kappa = await viewFactory.getOrCreate('view1', params.topic);
  kappa.use('ordered_log', OrderedLogView(params.type));

  // Create app from view.
  const view = kappa.api['ordered_log'];
  const app = new OrderedLogApp(view, params.itemId);

  await waitForExpect(async () => {
    const result = app.list({ parentField: 'parentId', sortField: 'author', rootParent });
    // Expect every message to come after parent.
    const incomingMessages = [];
    result.forEach(message => {
      if (message.parentId && message.parentId !== rootParent) {
        expect(incomingMessages).toContain(message.parentId);
      }
      incomingMessages.push(message.id);
    })
  });
});

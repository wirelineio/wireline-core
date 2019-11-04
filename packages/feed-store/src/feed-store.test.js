//
// Copyright 2019 Wireline, Inc.
//

const hypertrie = require('hypertrie');
const ram = require('random-access-memory');
const hypercore = require('hypercore');

const FeedStore = require('./feed-store');

describe('feedStore', () => {
  let db;

  beforeEach(() => {
    db = hypertrie(ram);
  });

  test('config with db and valueEncoding utf-8', async () => {
    const feedStore = await FeedStore.create(db, ram, { feedOptions: { valueEncoding: 'uft-8' } });

    expect(feedStore).toBeDefined();
  });

  test('Create feed', async () => {
    const feedStore = await FeedStore.create(db, ram, { feedOptions: { valueEncoding: 'uft-8' } });
    const feed = await feedStore.openFeed('test');

    expect(feed).toBeDefined();
    expect(feed).toBeInstanceOf(hypercore);
  });
});

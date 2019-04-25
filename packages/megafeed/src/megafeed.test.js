//
// Copyright 2019 Wireline, Inc.
//

const tempy = require('tempy');
const fs = require('fs');
const path = require('path');
const pify = require('pify');

const ram = require('random-access-memory');

const megafeed = require('./megafeed');

describe('config megafeed', () => {
  test('config with raf and valueEncoding utf-8', () => {
    const mf = megafeed(tempy.directory(), {
      valueEncoding: 'utf-8',
    });

    expect(mf._feeds._opts.valueEncoding).toBe('utf-8');
    expect(mf._root.feed._storage.key.constructor.name).toBe('RandomAccessFile');
  });

  test('config with ram and valueEncoding json', () => {
    const mf = megafeed(ram, {
      valueEncoding: 'json',
    });

    expect(mf._feeds._opts.valueEncoding).toBe('json');
    expect(mf._root.feed._storage.key.constructor.name).toBe('RAM');
  });

  test('megafeed should be ready after the initialize process', () => {
    const mf = megafeed(ram);
    return mf.ready();
  });

  test('initialize megafeed with a list of feeds', async () => {
    const mf = megafeed(ram, {
      feeds: [{ name: 'documentOne' }, { name: 'documentTwo' }],
    });

    await mf.ready();

    expect(mf.feeds().length).toBe(2);
  });
});

describe('add operations in a persistent feed', () => {
  beforeAll(() => {
    this.mf = megafeed(tempy.directory(), {
      valueEncoding: 'json',
    });
  });

  test('add feed: documentOne', async () => {
    const feed = await this.mf.addFeed({ name: 'documentOne' });
    this.feed = feed;

    expect(feed.name).toBe('documentOne');
  });

  test('add feed by key: bee80ff3a4ee5e727dc44197cb9d25bf8f19d50b0f3ad2984cfe5b7d14e75de7', async () => {
    const feed = await this.mf.addFeed({ key: 'bee80ff3a4ee5e727dc44197cb9d25bf8f19d50b0f3ad2984cfe5b7d14e75de7' });
    this.feed = feed;

    expect(feed.name).toBe('bee80ff3a4ee5e727dc44197cb9d25bf8f19d50b0f3ad2984cfe5b7d14e75de7');
  });
});

describe('list / get / delete / load / close operations', () => {
  beforeEach(async () => {
    this.mf = megafeed(tempy.directory(), {
      valueEncoding: 'json',
    });

    this.feed = await this.mf.addFeed({ name: 'documentOne' });
  });

  test('list feed: documentOne', () => {
    expect(this.mf.feeds().length).toBe(1);
  });

  test('get a feed: documentOne', async () => {
    let feed = await this.mf.feed('documentOne');
    expect(feed).toBe(this.feed);

    feed = await this.mf.feedByDK(feed.discoveryKey.toString('hex'));
    expect(feed).toBe(this.feed);
  });

  test('delete feed: documentOne', async () => {
    await this.mf.delFeed('documentOne');
    expect(this.mf.feeds().length).toBe(0);

    const root = this.mf._root;
    const getFeed = pify(root.get.bind(root));
    const feed = await getFeed(`feed/${this.feed.key.toString('hex')}`);
    expect(feed).toBeNull();
  });

  test('load feeds: documentOne', async () => {
    const feed = await this.mf.addFeed({ name: 'documentOne' });
    await pify(feed.close.bind(feed))();

    const result = await this.mf.loadFeeds(feed.key);
    expect(result.length).toBe(1);
    expect(this.mf.feed('documentOne')).toBe(result[0]);
  });

  test('close all feed', async () => {
    expect(this.mf.feeds().find(f => !f.closed)).not.toBeUndefined();
    await this.mf.close();

    expect(this.mf.feeds().find(f => !f.closed)).toBeUndefined();
  });

  test('close one feed: documentOne', async () => {
    await this.mf.closeFeed('documentOne');
    expect(this.mf.feed('documentOne').closed).toBeTruthy();
  });
});

describe('destroy megafeed storage', () => {
  beforeEach(async () => {
    this.dir = tempy.directory();

    this.mf = megafeed(tempy.directory(), {
      valueEncoding: 'json',
    });

    this.feed = await this.mf.addFeed({ name: 'documentOne' });
  });

  test('destroy storage for _root and documentOne', async () => {
    await this.mf.destroy();

    const access = pify(fs.access);
    await expect(access(path.join(this.dir, 'root', 'tree'), fs.F_OK)).rejects.toThrow('ENOENT');
    await expect(access(path.join(this.dir, 'documentOne', 'tree'), fs.F_OK)).rejects.toThrow('ENOENT');
  });
});

//
// Copyright 2019 Wireline, Inc.
//

const tempy = require('tempy');
const fs = require('fs');
const path = require('path');

const streamToPromise = require('stream-to-promise');
const pump = require('pump');
const pify = require('pify');

const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');

const megafeed = require('./megafeed');
const { getStat } = require('./feed-descriptor');

function sortByIndex(a, b) {
  return a.index - b.index;
}

describe('config megafeed', () => {
  test('config with raf and valueEncoding utf-8', () => {
    const mf = megafeed(tempy.directory(), {
      valueEncoding: 'utf-8',
    });

    expect(mf._feedStore._defaultFeedOptions.valueEncoding).toBe('utf-8');
    expect(mf._db.feed._storage.key.constructor.name).toBe('RandomAccessFile');
  });

  test('config with ram and valueEncoding json', () => {
    const mf = megafeed(ram, {
      valueEncoding: 'json',
    });

    expect(mf._feedStore._defaultFeedOptions.valueEncoding).toBe('json');
    expect(mf._db.feed._storage.key.constructor.name).toBe('RAM');
  });

  test('megafeed should be ready after the initialize process', () => {
    const mf = megafeed(ram);
    return mf.ready();
  });
});

describe('add operations in a persistent feed', () => {
  beforeAll(() => {
    this.mf = megafeed(tempy.directory(), {
      valueEncoding: 'json',
    });
  });

  test('add feed: documentOne', async () => {
    const feed = await this.mf.addFeed({ path: 'documentOne' });

    expect(getStat(feed).path).toBe('documentOne');
  });

  test('add feed by key: bee80ff3a4ee5e727dc44197cb9d25bf8f19d50b0f3ad2984cfe5b7d14e75de7', async () => {
    const key = 'bee80ff3a4ee5e727dc44197cb9d25bf8f19d50b0f3ad2984cfe5b7d14e75de7';
    const feed = await this.mf.addFeed({ path: 'documentTwo', key });
    expect(getStat(feed).path).toBe('documentTwo');
    expect(getStat(feed).key.equals(Buffer.from(key, 'hex'))).toBe(true);
  });
});

describe('list / get / delete / load / close operations', () => {
  beforeEach(async () => {
    this.mf = megafeed(tempy.directory(), {
      valueEncoding: 'json',
    });

    this.feed = await this.mf.addFeed({ path: 'documentOne' });
  });

  test('list feed: documentOne', () => {
    expect(this.mf.feeds().length).toBe(1);
  });

  test('get a feed: documentOne', async () => {
    let feed = this.mf.feed('documentOne');
    expect(feed).toBe(this.feed);

    feed = await this.mf.feedByDK(feed.discoveryKey);
    expect(feed).toBe(this.feed);
  });

  test('delete feed: documentOne', async () => {
    await this.mf.deleteFeed('documentOne');
    expect(this.mf.feeds().length).toBe(0);

    const db = this.mf._db;
    const getFeed = pify(db.get.bind(db));
    const feed = await getFeed(`feed/${this.feed.key.toString('hex')}`);
    expect(feed).toBeNull();
  });

  test('load feeds: documentOne', async () => {
    const feed = await this.mf.addFeed({ path: 'documentOne' });
    expect(feed).toBe(this.feed);
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

    this.feed = await this.mf.addFeed({ path: 'documentOne' });
  });

  test('destroy storage for _db and documentOne', async () => {
    await this.mf.destroy();

    const access = pify(fs.access);
    await expect(access(path.join(this.dir, 'root', 'tree'), fs.F_OK)).rejects.toThrow('ENOENT');
    await expect(access(path.join(this.dir, 'documentOne', 'tree'), fs.F_OK)).rejects.toThrow('ENOENT');
  });
});

describe('testing replicate process', () => {
  beforeEach(async () => {
    const partyKey = crypto.randomBytes(32);

    const peerOne = megafeed(ram, { valueEncoding: 'json' });
    const peerTwo = megafeed(ram, { valueEncoding: 'json' });

    const feedOne = await peerOne.addFeed({ path: 'local' });
    const feedTwo = await peerTwo.addFeed({ path: 'local' });

    feedOne.pAppend = pify(feedOne.append.bind(feedOne));
    feedTwo.pAppend = pify(feedTwo.append.bind(feedTwo));

    this.testingElements = { partyKey, peerOne, peerTwo, feedOne, feedTwo };
  });

  test('replicate using party default rules live=false', async () => {
    const { partyKey, peerOne, peerTwo, feedOne, feedTwo } = this.testingElements;

    const partyData = {
      name: 'test',
      key: partyKey
    };

    // Both peer needs to know the partyKey
    await peerOne.addParty(partyData);
    await peerTwo.addParty(partyData);

    const r1 = peerOne.replicate({ key: partyKey });
    const r2 = peerTwo.replicate({ key: partyKey });

    await feedOne.pAppend({ index: 0, value: 'hello from one' });
    await feedTwo.pAppend({ index: 1, value: 'hello from two' });

    await pify(pump)(r1, r2, r1);

    const resultOne = await streamToPromise(peerOne.createReadStream());
    const resultTwo = await streamToPromise(peerTwo.createReadStream());

    expect(resultOne.sort(sortByIndex)).toEqual(resultTwo.sort(sortByIndex));
  });

  test('replicate using party default rules live=true', async (done) => {
    const { partyKey, peerOne, peerTwo, feedOne, feedTwo } = this.testingElements;

    const partyData = {
      name: 'test',
      key: partyKey
    };

    // Both peer needs to know the partyKey
    await peerOne.addParty(partyData);
    await peerTwo.addParty(partyData);

    const r1 = peerOne.replicate({ key: partyKey, live: true });
    const r2 = peerTwo.replicate({ key: partyKey, live: true });
    pify(pump)(r1, r2, r1);

    const messages = [];
    peerOne.on('append', (feed) => {
      feed.head((err, message) => {
        messages.push(message);
        if (messages.length === 3) {
          expect(messages.sort(sortByIndex)).toEqual([
            { index: 0, value: 'hello from one' },
            { index: 1, value: 'hello from two' },
            { index: 2, value: 'hello from three' }
          ]);
          done();
        }
      });
    });

    await feedOne.pAppend({ index: 0, value: 'hello from one' });
    await feedTwo.pAppend({ index: 1, value: 'hello from two' });

    // Test what happen if you add a new feed after the replication process started
    const feedThree = await peerTwo.addFeed({ path: 'localThree' });
    await pify(feedThree.append.bind(feedThree))({ index: 2, value: 'hello from three' });
  });
});

describe('iterate over feeds and messages', () => {
  beforeEach(async () => {
    const mega = megafeed(ram, { valueEncoding: 'utf-8' });

    let feed = await mega.addFeed({ path: 'feed/0' });
    await pify(feed.append.bind(feed))('Message from feed/0');
    feed = await mega.addFeed({ path: 'feed/1' });
    await pify(feed.append.bind(feed))('Message from feed/1');

    this.testingElements = { mega };
  });

  test('createReadStream', async () => {
    const { mega } = this.testingElements;

    const messages = await streamToPromise(mega.createReadStream());

    expect(messages).toEqual([
      'Message from feed/0',
      'Message from feed/1'
    ]);
  });

});

//
// Copyright 2019 Wireline, Inc.
//

const tempy = require('tempy');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { pipeline } = require('stream');

const streamToPromise = require('stream-to-promise');

const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');

const megafeed = require('./megafeed');

function sortByIndex(a, b) {
  return a.index - b.index;
}

describe('config megafeed', () => {
  test('config with raf and valueEncoding utf-8', () => {
    const mf = megafeed(tempy.directory(), {
      valueEncoding: 'utf-8',
    });

    expect(mf._feeds._opts.valueEncoding).toBe('utf-8');
    expect(mf._db.feed._storage.key.constructor.name).toBe('RandomAccessFile');
  });

  test('config with ram and valueEncoding json', () => {
    const mf = megafeed(ram, {
      valueEncoding: 'json',
    });

    expect(mf._feeds._opts.valueEncoding).toBe('json');
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
    await this.mf.deleteFeed('documentOne');
    expect(this.mf.feeds().length).toBe(0);

    const db = this.mf._db;
    const getFeed = promisify(db.get.bind(db));
    const feed = await getFeed(`feed/${this.feed.key.toString('hex')}`);
    expect(feed).toBeNull();
  });

  test('load feeds: documentOne', async () => {
    const feed = await this.mf.addFeed({ name: 'documentOne' });
    await promisify(feed.close.bind(feed))();

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

  test('destroy storage for _db and documentOne', async () => {
    await this.mf.destroy();

    const access = promisify(fs.access);
    await expect(access(path.join(this.dir, 'root', 'tree'), fs.F_OK)).rejects.toThrow('ENOENT');
    await expect(access(path.join(this.dir, 'documentOne', 'tree'), fs.F_OK)).rejects.toThrow('ENOENT');
  });
});

describe('testing replicate process', () => {
  beforeEach(async () => {
    const partyKey = crypto.randomBytes(32);

    const peerOne = megafeed(ram, { valueEncoding: 'json' });
    const peerTwo = megafeed(ram, { valueEncoding: 'json' });

    const feedOne = await peerOne.addFeed({ name: 'local' });
    const feedTwo = await peerTwo.addFeed({ name: 'local' });

    this.testingElements = { partyKey, peerOne, peerTwo, feedOne, feedTwo };
  });

  test('replicate using party default rules (live=false)', async () => {
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

    await promisify(pipeline)(r1, r2, r1);

    const resultOne = await streamToPromise(peerOne.createReadStream());
    const resultTwo = await streamToPromise(peerTwo.createReadStream());

    expect(resultOne.sort(sortByIndex)).toEqual(resultTwo.sort(sortByIndex));
  });

  test('replicate using party default rules (live=true)', async (done) => {
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
    promisify(pipeline)(r1, r2, r1);

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
    const feedThree = await peerTwo.addFeed({ name: 'localThree' });
    await feedThree.pAppend({ index: 2, value: 'hello from three' });
  });

  test('replicate using party default rules (live=false, filter=["local", "party-feed/current"])', async () => {
    const { partyKey, peerOne, peerTwo, feedOne, feedTwo } = this.testingElements;

    const partyData = {
      name: 'test',
      key: partyKey,
      metadata: {
        filter: [
          'local',
          `party-feed/${partyKey.toString('hex')}/**`
        ]
      }
    };

    // Both peer needs to know the partyKey
    await peerOne.addParty(partyData);
    await peerTwo.addParty(partyData);

    const r1 = peerOne.replicate({ key: partyKey });
    const r2 = peerTwo.replicate({ key: partyKey });

    const ilegalFeed = await peerTwo.addFeed({ name: 'ilegalFeed' });

    await feedOne.pAppend({ index: 0, value: 'hello from one' });
    await feedTwo.pAppend({ index: 1, value: 'hello from two' });
    await ilegalFeed.pAppend({ index: 2, value: 'hello from ilegalFeed' });

    await promisify(pipeline)(r1, r2, r1);

    const resultOne = await streamToPromise(peerOne.createReadStream());
    const resultTwo = await streamToPromise(peerTwo.createReadStream());

    expect(resultOne.sort(sortByIndex)).toEqual([
      { index: 0, value: 'hello from one' },
      { index: 1, value: 'hello from two' }
    ]);

    expect(resultTwo.sort(sortByIndex)).toEqual([
      { index: 0, value: 'hello from one' },
      { index: 1, value: 'hello from two' },
      { index: 2, value: 'hello from ilegalFeed' }
    ]);
  });
});

describe('iterate over feeds and messages', () => {
  beforeEach(async () => {
    const mega = megafeed(ram, { valueEncoding: 'utf-8' });

    let feed = await mega.addFeed({ name: 'feed/0' });
    await feed.pAppend('Message from feed/0');
    feed = await mega.addFeed({ name: 'feed/1' });
    await feed.pAppend('Message from feed/1');

    this.testingElements = { mega };
  });

  test('createReadStream (filter=[feed/0])', async () => {
    const { mega } = this.testingElements;

    const messages = await streamToPromise(mega.createReadStream({ filter: 'feed/0' }));

    expect(messages).toEqual(['Message from feed/0']);
  });

  test('watch (filter=[feed/1])', (done) => {
    const { mega } = this.testingElements;
    const messages = [];

    mega.watch({ filter: 'feed/1' }, (message) => {
      messages.push(message);
      if (messages.length === 2) {
        expect(messages).toEqual(['Message from feed/1', 'Message 2 from feed/1']);
        done();
      }
    });

    mega.feed('feed/1').append('Message 2 from feed/1');
  });

});

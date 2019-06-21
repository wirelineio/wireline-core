//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');

const hypercore = require('hypercore');
const hypertrie = require('hypertrie');
const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');
const pump = require('pump');
const pify = require('pify');

const PartyMap = require('./party-map');

const feedPromisify = (feed) => {
  const newFeed = feed;
  ['ready', 'append', 'close', 'get', 'head'].forEach((prop) => {
    if (feed[prop]) {
      newFeed[`p${prop[0].toUpperCase() + prop.slice(1)}`] = pify(feed[prop].bind(feed));
    }
  });
  return newFeed;
};

class Peer extends EventEmitter {
  constructor() {
    super();

    this._feeds = new Map();

    this.addFeed('local', ram, { valueEncoding: 'utf-8' });

    this._parties = new PartyMap(hypertrie(ram));

    this._parties.setRules({
      name: 'simple-party',

      replicateOptions: {
        expectedFeeds: 2
      },

      findFeed: ({ discoveryKey }) => this.feeds.find(feed => feed.discoveryKey.toString('hex') === discoveryKey),

      handshake: async ({ peer }) => {
        const localFeed = this.feed('local');

        await peer.introduceFeeds({
          keys: [localFeed.key]
        });

        peer.replicate(localFeed);
      },

      onIntroduceFeeds: async ({ message, peer }) => {
        const { keys } = message;

        keys.forEach((key) => {
          const feed = this.addFeed(key, ram, key, { valueEncoding: 'utf-8' });

          peer.replicate(feed);
        });
      }
    });
  }

  get feeds() {
    return Array.from(this._feeds.values());
  }

  feed(key) {
    return this._feeds.get(key);
  }

  addFeed(key, ...args) {
    const feed = feedPromisify(hypercore(...args));
    this._feeds.set(key.toString('hex'), feed);
    return feed;
  }

  async connect(partyKey) {
    await this.feed('local').pReady();

    await this._parties.addParty({
      name: 'party',
      key: partyKey,
      rules: 'simple-party'
    });

    return this._parties.replicate({ key: crypto.discoveryKey(partyKey) });
  }
}

describe('simple party replication', () => {
  test('one feed replication', async () => {
    const partyKey = crypto.keyPair().publicKey;

    const peerOne = new Peer();
    peerOne.feed('local').append('hi from peerOne');

    const peerTwo = new Peer();
    peerTwo.feed('local').append('hi from peerTwo');

    const streamOne = await peerOne.connect(partyKey);
    const streamTwo = await peerTwo.connect(partyKey);

    await new Promise((resolve, reject) => {
      pump(streamOne, streamTwo, streamOne, (err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });

    const remoteFeedOne = peerTwo.feed(peerOne.feed('local').key.toString('hex'));
    const remoteFeedTwo = peerOne.feed(peerTwo.feed('local').key.toString('hex'));

    expect(remoteFeedOne).not.toBeUndefined();
    expect(remoteFeedTwo).not.toBeUndefined();

    await expect(remoteFeedOne.pHead()).resolves.toBe('hi from peerOne');
    await expect(remoteFeedTwo.pHead()).resolves.toBe('hi from peerTwo');
  });
});

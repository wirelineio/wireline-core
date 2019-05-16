//
// Copyright 2019 Wireline, Inc.
//

const hypercore = require('hypercore');
const ram = require('random-access-memory');
const crypto = require('hypercore-crypto');
const pump = require('pump');
const { EventEmitter } = require('events');

const createRoot = require('./root');
const FeedMap = require('./feed-map');
const { PartyMap } = require('./megafeed');

const createFeed = (...args) => {
  const feed = hypercore(...args);

  return FeedMap.feedPromisify(feed);
};

class Peer extends EventEmitter {
  constructor(partyKey) {
    super();

    const { publicKey, secretKey } = crypto.keyPair();

    this.partyKey = partyKey;

    this.localFeed = createFeed(ram, publicKey, { valueEncoding: 'utf-8', secretKey });

    this.feeds = [
      createFeed(ram, { valueEncoding: 'utf-8' }),
      this.localFeed
    ];

    this.parties = new PartyMap({
      root: createRoot(ram),
      findFeed: dk => this.feeds.find(feed => feed.discoveryKey.toString('hex') === dk)
    });

    this.parties.setRules({
      name: 'simple-party',

      replicateOptions: {
        expectedFeeds: 2
      },

      handshake: async ({ peer }) => {
        await peer.introduceFeeds({
          keys: [this.localFeed.key]
        });

        peer.replicate(this.localFeed);
      },

      remoteIntroduceFeeds: async ({ message, peer }) => {
        const { keys } = message;
        keys.forEach((key) => {
          const feed = createFeed(ram, key, { valueEncoding: 'utf-8' });

          if (!this.feeds.find(f => f.key.toString('hex') === feed.key.toString('hex'))) {
            this.feeds.push(feed);
          }

          peer.replicate(feed);
        });
      }
    });
  }

  async connect() {
    await this.localFeed.pReady();

    await this.parties.setParty({
      name: 'party',
      key: this.partyKey,
      rules: 'simple-party'
    });

    return this.parties.replicate({ partyDiscoveryKey: crypto.discoveryKey(this.partyKey) });
  }
}

describe('simple party replication', () => {
  test('one feed replication', async () => {
    const partyKey = crypto.keyPair().publicKey;

    const peerOne = new Peer(partyKey);
    peerOne.localFeed.append('hi from peerOne');

    const peerTwo = new Peer(partyKey);
    peerTwo.localFeed.append('hi from peerTwo');

    const streamOne = await peerOne.connect();
    const streamTwo = await peerTwo.connect();

    await new Promise((resolve, reject) => {
      pump(streamOne, streamTwo, streamOne, (err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });

    const remoteFeedOne = peerTwo.feeds.find(feed => feed.key.toString('hex') === peerOne.localFeed.key.toString('hex'));
    const remoteFeedTwo = peerOne.feeds.find(feed => feed.key.toString('hex') === peerTwo.localFeed.key.toString('hex'));

    expect(remoteFeedOne).not.toBeUndefined();
    expect(remoteFeedTwo).not.toBeUndefined();
    await expect(remoteFeedOne.pHead()).resolves.toBe('hi from peerOne');
    await expect(remoteFeedTwo.pHead()).resolves.toBe('hi from peerTwo');
  });
});

# Wireline Party

[![CircleCI](https://circleci.com/gh/wirelineio/wireline-core.svg?style=svg&circle-token=93ede761391f88aa9fffd7fd9e6fe3b552e9cf9d)](https://circleci.com/gh/wirelineio/wireline-core)
[![npm version](https://badge.fury.io/js/%40wirelineio%2Fparty.svg)](https://badge.fury.io/js/%40wirelineio%2Fparty)

> Module for selective replication of feeds.

## Install

```
$ npm install @wirelineio/party
```

## How it works

![parties](https://github.com/wirelineio/wireline-core/raw/master/assets/parties.png)

### Party

A `Party` is a `virtual space` in a network with a `set of authorized feeds` where `peers` can share and replicate.

Works on top of the [hypercore-protocol](https://github.com/mafintosh/hypercore-protocol).

It's identified by a `key`. You can use the `party.discoverKey` to find other peers in the network without leak the party key.

As a basic authorization mechanism, only the peers that knows the key can access to the Party.

### Party Rules

Each Party follow a set of rules that we called `Party Rules` that gives you complete freedom to:
  1. Define how each peer should share their `feeds`.
  1. Build custom mechanism for authorization and credentials.
  1. Talk with other peers through `Ephemeral Messages`.

So, `Party Rules` defines the purpose of a specific Party, like what kind of operation each `Peer` can do and/or which `feeds` are
authorized to be replicated.

### Feed Agnostic

We've been talking about share feeds in a Party but what is a `feed`?

Our solution uses hypercore-protocol, so any `data structure` implementation builded on top of the same protocol it should works.

Your party can share and replicate a set of:
  1. [hypercore](https://github.com/mafintosh/hypercore)
  1. [hyperdrive](https://github.com/mafintosh/hyperdrive)
  1. [hyperdb](https://github.com/mafintosh/hyperdb)
  1. [hypertrie](https://github.com/mafintosh/hypertrie)

## Usage

### Single party multi-writer with two writers

```javascript
const { pipeline } = require('stream');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const ram = require('random-access-memory');
const hypercore = require('hypercore');

const { Party } = require('@wirelineio/party');

class Peer extends EventEmitter {
  constructor(partyKey) {
    super();

    this.local = this.addFeed();

    this.reader = null;

    this.party = new Party({
      key: partyKey,
      rules: {
        findFeed: ({ discoveryKey }) => {
          // Search a feed by their discoverKey and return it.
          if (this.local.discoveryKey.equals(discoveryKey)) {
            return this.local;
          }

          return this.reader;
        },
        handshake: async ({ peer }) => {
          // Share your feed and wait for the peer response
          await peer.introduceFeeds({ keys: [this.local.key] });

          // Replicate you feed
          await peer.replicate(this.local);
        },
        onIntroduceFeeds: async ({ peer, message }) => {
          // Event handler to process the incoming messages
          const { keys } = message;

          // You receive a new key and instance the hypercore as reader
          this.reader = this.addFeed(keys[0]);

          return peer.replicate(this.reader);
        }
      }
    });
  }

  replicate(opts) {
    return this.party.replicate(opts);
  }

  sendMessage(msg, cb) {
    this.local.append(msg, cb);
  }

  addFeed(key) {
    const feed = hypercore(ram, key, { valueEncoding: 'utf-8' });

    feed.on('append', () => {
      feed.head((err, block) => {
        this.emit('message', block);
      });
    });

    return feed;
  }
}

const partyKey = crypto.randomBytes(32);

const alice = new Peer(partyKey);
const max = new Peer(partyKey);

const r1 = alice.replicate({ live: true });
const r2 = max.replicate({ live: true });

setInterval(() => {
  alice.sendMessage("Hi I'm Alice");
}, 1000);

max.on('message', console.log);

pipeline(r1, r2, r1, (err) => {
  if (err) {
    console.log(err);
  }
});
```

## API

* Arguments with `!` are required, the rest are optional.
* Arguments with `[]` are an Array of values.
* Arguments with `|` means that could be any of the defined values.
* Arguments with `=` defines a default value.

## Background

### Hypercore Protocol Feature/Constraints

1. An hypercore connection beetwen two peers it's established using a public key in common. `The first feed key`.
1. `The first feed key` shared is also used to encrypt the stream.
1. Hypercore Protocol allows to share multiple feeds in a single hypercore connection: `Feed multiplexer`.
1. In order to replicate a feed beetwen two peers, each peer needs to know the key of that feed.
1. Hypercore Protocol provides a way to build `extension` messages on top of it.

### Issues/Questions

1. What represent `the first feed key` in our solution?
1. How we share the `the first feed key`?
1. How we talk with other peers to send/receive feeds?
1. How we decide `which feeds` we want to replicate?

### Current solutions

#### [Multifeed](https://github.com/kappa-db/multifeed)

It's a module for management feeds (writer and reader) and replicate them.

The module uses a global `key` hardcoded or set it by option as `the first feed key`.

When a connection (handshake successful) is established each multifeed `share their entire list of feeds with the other peer`.

It's doesn't have a way to selects which feeds want to share or receive.

#### [Hyperdb](https://github.com/mafintosh/hyperdb)

It's a module that provides a key/value database on top multiple hypercores.

The database starts with a local initial feed and it uses the key of that feed as `the first feed key`.

When a connection is established, hyperdb share the list of authorized feeds with the other peer. That's how Hyperdb selects
which feeds want to share o receive.

# Wireline Megafeed

[![CircleCI](https://circleci.com/gh/wirelineio/wireline-core.svg?style=svg&circle-token=93ede761391f88aa9fffd7fd9e6fe3b552e9cf9d)](https://circleci.com/gh/wirelineio/wireline-core)
[![npm version](https://badge.fury.io/js/%40wirelineio%2Fmegafeed.svg)](https://badge.fury.io/js/%40wirelineio%2Fmegafeed)

> Manage multiple feeds and replicate them.

## Features

1. Create/Update/Delete feeds in a persisted key/value structure.
  - It uses a [hypertrie](https://github.com/mafintosh/hypertrie) to keep all the feeds persisted.
1. Naming feeds.
1. Search feeds by keys and/or name.
1. Load feeds by demand using glob patterns.
1. Support for different types of `feed like` structures: hypercore, hyperdrive, hyperdb.

## Install

```
$ npm install @wirelineio/megafeed
```

## Usage

```javascript
const { pipeline } = require('stream');
const crypto = require('crypto');
const ram = require('random-access-memory');
const megafeed = require('@wirelineio/megafeed');

const alice = megafeed(ram, {
  valueEncoding: 'utf-8'
});

const max = megafeed(ram, {
  valueEncoding: 'utf-8'
});

alice.on('append', feed => feed.head(console.log));
max.on('append', feed => feed.head(console.log));

(async () => {
  await alice.ready();
  await max.ready();

  await max.addParty({ key: alice.key });

  // replicate
  const r1 = alice.replicate({ discoveryKey: alice.key, live: true });
  const r2 = max.replicate({ live: true });
  pipeline(r1, r2, r1, (err) => {
    if (err) {
      console.log(err);
    }
  });

  const aliceFeed = await alice.addFeed({ name: 'chat' });
  const maxFeed = await max.addFeed({ name: 'chat' });

  aliceFeed.append("Hi i'm Alice");
  maxFeed.append("Hi i'm Max");
})();
```

## API

* Arguments with `!` are required, the rest are optional.
* Arguments with `[]` are an Array of values.
* Arguments with `|` means that could be any of the defined values.
* Arguments with `=` defines a default value.

### `const mega = megafeed(storage!, key, options)`

Create a megafeed instance.

#### `storage!`

Set a default storage for the hypertrie and the rest of the feeds.

#### `key`

Set a publicKey for the hypertrie feed.

#### `options`
* `feeds: [options]`: Defines an initial list of feeds to create or load. The options are the same that you define with the method `addFeed`.
```javascript
[
  { name: 'feedOne' },
  { name: 'feedTwo', valueEncoding: 'utf-8' }
]
```
* `types: Object`: Defines different constructors for different types of feed structures
```javascript
{
  hyperdrive(storage, key, opts) {
    return hyperdrive(storage, key, opts);
  },
  hypertrie(storage, key, opts) {
    return hypertrie(storage, key, opts);
  }
}
```
* `...hypercoreOptions`: Defines a default hypercore options to apply in the `addFeed` process.

### `mega.ready(callback) -> Promise`

Execute a callback or resolve a promise when the megafeed instance is ready.

### `mega.addFeed(options) -> Promise`

Add a new feed to mega.

**If the feed already exists but is not loaded it will load the feed instead of create a new one.**

#### `options`
* `name: string`: Define a semantic name for the feed.
* `key: string|buffer`: Define a publicKey for the feed.
* `type: string`: Type of constructor feed.
* `load: false`: Defines if the feed needs to be loaded during the next megafeed initialization.
* `persist: true`: Defines if the feed needs to be persisted in the [hypertrie](https://github.com/mafintosh/hypertrie) root.
* `storage: random-access-*`: Define a specific storage for the feed.
* `...hypercoreOptions`: Since a feed is an hypercore feed you can use the same options here.

### `mega.feed(name|key) -> Feed`

Search a feed by the name, the public key and the discovery key.

### `mega.feeds(all = false) -> [Feed]`

Returns a list of the `loaded` feeds.

#### `all`

If is true it will return the entire list of feeds loaded and unloaded.

## Background

### Hypercore Constraints

1. It's single writer.

### Issues/Questions

1. How we do a multi-writer solution using hypercore?

### Current solutions

#### [Multifeed](https://github.com/kappa-db/multifeed) + [kappa-core](https://github.com/kappa-db/kappa-core)

It's a module for management feeds (writer and reader).

The `multi-writer` solution of Multifeed works by maintaining a set of local feeds (writable and/or readable)
and using kappa togenerate filtered views from the data of each hypercore.

This abstraction provides a simple way to work with the data of all your feeds.

#### [Hyperdb](https://github.com/mafintosh/hyperdb)

It's a module that provides a key/value database on top multiple hypercores.

The `multi-writer` of Hyperdb works creating a graph of authorized writable feeds. These feeds are the only who are authorized to
write in the database.

#### Our solution

We took some ideas from how multifeed + kappa `materialized` the data inside our `feeds`.

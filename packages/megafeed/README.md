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
1. Selective replication of the feeds.

## Install

```
$ npm install @wirelineio/megafeed
```

## Usage

```javascript
const { pipeline } = require('stream');
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

  // replicate
  const r1 = alice.replicate({ key: alice.key, live: true });
  const r2 = max.replicate({ key: alice.key, live: true });
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

### `await mega.ready(callback)`

Execute a callback or resolve a promise when the megafeed instance is ready.

### `await mega.addFeed(options) -> Feed`

Add a new feed to mega.

**If the feed already exists but is not loaded it will load the feed instead of create a new one.**

#### `options`
* `name: string`: Define a semantic name for the feed.
* `key: string|buffer`: Define a publicKey for the feed.
* `type: string`: Type of constructor feed.
* `load: boolean = false`: Defines if the feed needs to be loaded during the next megafeed initialization.
* `persist: boolean = true`: Defines if the feed needs to be persisted in the [hypertrie](https://github.com/mafintosh/hypertrie) root.
* `storage: random-access-*`: Define a specific storage for the feed.
* `silent: boolean = false`: Don't emit a `feed` event after create the feed.
* `...hypercoreOptions`: Since a feed is an hypercore feed you can use the same options here.

### `mega.feed(name|key) -> Feed`

Search a feed by the name, the public key and the discovery key.

### `mega.feedByDK(discoveryKey) -> Feed`

`Performant` search of a feed by their discoveryKey. Use it every time that you can.

### `mega.feeds(all = false) -> [Feed]`

Returns a list of the `loaded` feeds.

#### `all`

If is true it will return the entire list of feeds loaded and unloaded.

### `mega.createReadStream(options) -> ReadableStream`

Creates a ReadableStream to read the messages of the entire collection of the loaded feeds.

#### `options`

* `filter: glob`: Glob pattern to filter messages from specific feeds.
*  `...optionsHypercore`: [hypercore.createReadStream](https://github.com/mafintosh/hypercore#var-stream--feedcreatereadstreamoptions)

### `mega.watch(options, callback) -> DisposeFunction`

Watch for new messages in megafeed.

#### `options`

* `filter: glob`: Glob pattern to filter messages from specific feeds.
*  `...optionsHypercore`: [hypercore.createReadStream](https://github.com/mafintosh/hypercore#var-stream--feedcreatereadstreamoptions)

#### `callback: function`

Function to iterate over the messages.

#### `DisposeFunction`

Function to destroy the current watcher.

### `await mega.loadFeeds(pattern) -> [Feed]`

Megafeed allows you to have unloaded feeds in your system and load them by demand using glob pattern.

```javascript
// Feeds in megafeed
// [{ name: 'db/books' }, { name: 'db/movies' }, { name: 'db/users' }]

// Load only books and movies
const feeds = await mega.loadFeeds('db/{books,movies}');

console.log(feeds.length === 2) // true
```

### `await mega.addParty(options) -> Party`

Add a [party](https://github.com/wirelineio/wireline-core/tree/master/packages/party) where the megafeed instance
is going to replicate their feeds.

#### `options`

* `key: string = crypto.randomBytes(32)`: A `publicKey` to identify the party and it would derivate a discoveryKey from there.
* `name: string = partyKey`: An optional semantic name to identify the party.
* `rules: Rules|string = 'megafeed:default'`: The handshake rules that the party is going to use. More info in: [@wirelineio/party](https://github.com/wirelineio/wireline-core/tree/master/packages/party)
* `metadata: object|buffer`: Prop to store custom information about the party.

#### PartyRule: `megafeed:default`

Megafeed comes with a default party rules for your replicate process.

The rules are simple:

1. `Share` and `replicate` every feed in your megafeed.
1. `Receive` and `replicate` every feed from others.

But if you want to do a selective replication of your feeds you can create your own rules or use the `metadata.filter`.

In the next example we are replicating only the feeds with the name `db/books` and `db/movies`:

```javascript
const party = await mega.addParty({
  metadata: {
    filter: 'db/{books,movies}'
  }
})

// pump(party.replicate(), ...)
```

### `mega.replicate(options)`

Create a replication stream based for a specific party. You should pipe this to another megafeed instance.

#### `options`

* `key: string|buffer`: Key of the party that you want to replicate.
    * You can use the `discoveryKey` here but in that case you should `add the party` in you megafeed by some mechanism invitation.
* `...hypercoreReplicateOptions`: The rest of the options are the same that you use in [hypercore.replicate](https://github.com/mafintosh/hypercore#var-stream--feedreplicateoptions)

### `mega.key`

Gets the publicKey of the megafeed.

### `mega.discoveryKey`

Gets the discoveryKey of the megafeed.

### `mega.secretKey`

Gets the secretKey of the megafeed.

### `mega.on('feed', feed => {})`

Event emitted when a new feed was created.

### `mega.on('append', feed => {})`

Event emitted when a new message was appended in one of the feeds maintaining by megafeed.

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

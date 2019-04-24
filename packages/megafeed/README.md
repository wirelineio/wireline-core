# Megafeed

Megafeed is a module that manages multiple hypercore feeds.

It uses a [hypertrie](https://github.com/mafintosh/hypertrie) to keep all the feeds persisted.

## Install

```
$ npm install @wirelineio/megafeed
```

## Getting Started

```javascript
const megafeed = require('@wirelineio/megafeed');

const mega = megafeed('./db', key, {
  feeds: [
    { name: 'feedOne' },
    { name: 'feedTwo' },
    { key: remoteKey }
  ],
  valueEncoding: 'json'
});

mega.addFeed({ name: 'feedThree' }, (err, feedThree) => {
  const feedOne = mega.feed('feedOne');

  feedOne.append({ message: 'hi' }, (err, seq) => {
    feedOne.get(seq, console.log);
  });

  feedThree.append({ message: 'hola' }, (err, seq) => {
    feedThree.get(seq, console.log);
  });
})
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
* `...hypercoreOptions`: Defines a default hypercore options to apply in the `addFeed` process.

### `mega.ready(callback) -> Promise`

Execute a callback or resolve a promise when the megafeed instance load all the necessary feeds.

### `mega.addFeed(options!, callback) -> Promise`

Add a new feed to mega.

**If the feed already exists but is not loaded it will load the feed instead of create a new one.**

#### `options`
* `name: string`: Define a semantic name for the feed.
* `key: string|buffer`: Define a publicKey for the feed.
* `load: false`: Defines if the feed needs to be loaded during the next megafeed initialization.
* `persist: true`: Defines if the feed needs to be persisted in the [hypertrie](https://github.com/mafintosh/hypertrie) root.
* `storage: random-access-*`: Define a specific storage for the feed.
* `...hypercoreOptions`: Since a feed is an hypercore feed you can use the same options here.

### `mega.feed(name|key) -> Feed`

Search a feed by the name, the public key and the discovery key.

### `mega.feeds(all = false) -> [Feed]`

Returns a list the `loaded` feeds.

#### `all`

If is true it will return the entire list of feeds loaded and unloaded.

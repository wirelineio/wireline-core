# framework

## Install

```
yarn add @wirelineio/framework
```

## Usage

`Framework` is an abstraction to provide access to messages, connect to a feed and exchange data over the megafeed implementation. It abstract the model (called views) for a better interaction with the DAT layer.

In order to exchange message a peer has to connect to a swarm first where it publishes peer information as the discoveryKey. We have to distinct 2 different types of peers: bots and non-bots (or just peers).

We need the distinction since a bot will participate in many different conversations or "parties" at the same time, which requires the bot to accept a bigger number of connections and handle parties in a slightly different way.

The concept of a "party" comes from megafeed. The important idea here is to see the party as a way to communicate a reduced set of feeds.

### Peer Example

We need to create a Framework instance where we can establish a set of configurations that has to be shared among other peers so they can "see" each other: 

- Signal Server: In order to be able to see other peers all of them have to be in the same signal server (hub).
- PartyKey: A partyKey is important to be able to read or sync messages. One peer can specify a partyKey where it will publish all feeds. Then in order to get another peer to receive those messages and share its own, both have to be in the same party. This can be done by setting the same `partyKey` in the configuration or using a `setParty` method.

```js

import { Framework } from '@wirelineio/framework';

// Create and initialize peer1
const peer1 = Framework({
  keys: {
    hub: 'https://my-signal-server.com',
    partyKey: Buffer.form(PARTY_KEY_1, 'hex'),
    name: 'Peer1'
  }
})

await peer1.initialize();

// Create and initialize peer2
const peer2 = Framework({
  keys: {
    hub: 'https://my-signal-server.com',
    partyKey: Buffer.form(PARTY_KEY_2, 'hex'),
    name: 'Peer2'
  }
})

await peer2.initialize();

// Make peer2 join party from peer1
peer2.partyManager.setParty({ key: PARTY_KEY_1 });

```

Since both peers are in the same party they can already exchange messages.


### Bots

As mentioned before, the bots requires an extra configuration and they have some different rules:

- A bot must specify the `isBot: true` in configuration.
- Since a bot is a usually a passive listener on others parties, we don't need to configure the partyKey.
- A bot joins a party when the peer invites the bot. We need to know the bot PK in order to do that.
- A bot can talk to another bot only if both of them have the same `partyKey`.
- If `partyKey` is specified it must not be the same as the bot PK.

```js
// Bot.js

const bot = Framework({
  keys: {
    isBot: true
    hub: 'https://my-signal-server.com',    
    name: 'bot-name',
    keys: {
      publicKey: Buffer.from(BOT_PUBLIC_KEY, 'hex'),
      secretKey: Buffer.from(BOT_SECRET_KEY, 'hex'),
    }
  }
});

await bot.initialize();

// Note: Here `keys` are not necessary, it just a convinience to know the bot PK to connect from the peer.
// The bot PK can be retrieved with `bot.mega.key`

```

Now from the peer code:

```js

// Initialization of peer1 ...

// This will send a message to the bot with the peer1 currentPartyKey so the bot can join the party.
peer1.connectToBot({ key: BOT_PUBLIC_KEY });


```

## API


### Framework(conf)

Construct a new Framework instance. Sets configuration for `kappa`, `megafeed` and `swarm`.

```
  new Framework(conf)

  /**
   * Framework core. Creates kappa views and configs swarming.
   *
   * @param conf.name {String} Name. If provided, profile will be set on contacts view. Optional.
   * @param conf.storage {Function} A random-access-* implementation for storage.
   * @param conf.keys {Object}
   * @param conf.key.publicKey {Buffer}
   * @param conf.key.secretKey {Buffer}
   * @param conf.hub {String} Signalhub url for swarm connection.
   * @param conf.isBot {Boolean} Sefines if framework is for a bot.
   * @param conf.partyKey {Buffer} Sefines initial party key.
   * @param conf.maxPeers {Number} Maximum connections on swarm. Optional. Defaults: If isBot is true it is set to 64 otherwise 2.
   */

```

### async initialize()

Await for connection in `swarm`, `setProfile` and other async operations that have to be done before ready state. 

``` 
  const framework = new Framework(config);
  await framework.initialize();
```

### partyManager

#### async connectToBot(opts)

Send the currentParty information to a bot in the same `swarm`.

```
await framework.partyManager.connectToBot(opts)

  /**
   * @param opts {Object}
   * @param opts.key {Buffer} Bot PublicKey.
   */

```

#### async setParty(opts)

Switches currentParty.

```
await framework.partyManager.setParty(opts);

  /**
   * @param opts {Object}
   * @param opts.key {Buffer} Party Key.
   */

```

#### currentPartyKey

Returns the current `partyKey`.

```
framework.partyManager.currentPartyKey

```

## Views

We can distinct two different types of views: _core_ and _pads_. The `api` contains the following views (kappa):

- `contacts`(core)
- `documents`
- `sheets`
- `chess`
- `graphs`
- `sketches`

## Core Views

Core views represent the main data model.

### `contacts`

The contacts view gives you access to handle `profile` and `contacts` operations.

#### contacts.getProfile()

```js
async framework.kappa.api['contacts'].getProfile({ key })
```

#### contacts.setProfile()

```js
async framework.kappa.api['contacts'].setProfile({ key, data })
```

#### contacts.getContacts()

```js
async framework.kappa.api['contacts'].getContacts()
```

## Pad Views

A pad view represents a type of item.

- `logs`: Logs view are append-only log items.
- `documents[crdt]`: A CRDT document represents changes that creates a single item by applying each change as a patch for a final item content.

### `documents`

The documents view provides operations for handling collaborative text documents.

#### documents.create(opts)

```js
async framework.kappa.api['documents'].create({ type, title = 'Untitled', partyKey })
```

Creates a new document.

- `type`: This is the `pad` type. For creating a text document the type should be set to `document`. Note that this is driven from the pad code so it cannot be set by default in `framework-core`.
- `partyKey`: Optional. If not provided it will use the `framework.currentPartyKey`.

#### documents.getById(itemId)

```js
async framework.kappa.api['documents'].getById(itemId)
```

Retrieves a document by itemId.

#### documents.appendChange(itemId, changes)

```js
async framework.kappa.api['documents'].appendChange(itemId, changes)
```

Append a new change message on the document with `itemId`.

#### documents.getChanges(itemId, opts)

```js
async framework.kappa.api['documents'].getChanges(itemId, { reverse, lastChange })
```

#### documents.onChange(itemId, cb)

```js
async framework.kappa.api['documents'].onChange(itemId, cb)
```

TBC

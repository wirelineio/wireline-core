# Wireline Discovery Swarm Memory

## Description

A minimal implementation of the [discovery-swarm](https://github.com/mafintosh/discovery-swarm)
to simulate and test multiple connections in memory.

## Usage

### Example

```javascript
import swarm from '@wirelineio/discovery-swarm-memory';

const sw = swarm();

sw.listen(1000)
sw.join('ubuntu-14.04') // can be any id/name/hash

sw.on('connection', function (connection) {
  console.log('found + connected to peer')
})
```

## API

#### `var sw = swarm(opts)`

Create a new swarm. Options include:
```js
{
  id: crypto.randomBytes(32), // peer-id for user
  stream: stream // stream to replicate across peers
}
```

For full list of `opts` take a look at [discovery-channel](https://github.com/maxogden/discovery-channel)

#### `sw.join(key, [opts], [cb])`

Join a channel specified by `key` (usually a name, hash or id, must be a **Buffer** or a **string**). After joining will immediately search for peers advertising this key.

#### `sw.leave(key)`

Leave the channel specified `key`

#### `sw.on('connection', function(connection, info) { ... })`

Emitted when you have fully connected to another peer. Info is an object that contains info about the connection.

`info`

```js
{
  initiator: true, // whether we initiated the connection or someone else did.
  channel: Buffer('...'), // the channel this connection was initiated on. only set if initiator === true.
  id: Buffer('...') // the remote peer's peer-id.
}
```

#### `sw.on('connection-closed', function(connection, info) { ... })`

Emitted when you've disconnected from a peer. Info is an object that contains info about the connection.

#### `sw.listen(port)`

Listen on a specific port. Should be called before join

# Wireline Hyperswarm Network Memory

## Description

A minimal implementation of the [hyperswarm-network](https://github.com/hyperswarm/network)
to simulate and test multiple connections in memory.

## Usage

### Example

```javascript
import { Network } from '@wirelineio/hyperswarm-network-memory';

const net = new Network();

net.id // the ID of the peer

net.join(Buffer.from('someTopic'));

net.leave(Buffer.from('someTopic'));

net.on('connection', (connection, details) => {});
net.on('disconnection', (connection, details) => {});
```

### API

#### `net = new Network()`

It creates a new Network instance. Each peer should have a Network instance.

#### `net.join(topic)`

Join the swarm for the given topic.
This will cause peers to be discovered for the topic.
Connections will automatically be created to those peers ('connection' event).

Parameters:

- `topic`. Buffer. The identifier of the peer-group to list under.

#### `net.leave(topic)`

Leave the swarm for the given topic.

Parameters:

- `topic`. Buffer. The identifier of the peer-group to list under.

#### `net.on('connection', (socket, details) => {})`

A new connection has been created. You should handle this event by using the socket.

- `socket`. DuplexStreamMock. The established TCP connection representation.
- `details`. Object describing the connection.
 - `type`. String. Should be either `'tcp'` or `'utp'`.
 - `client`. Boolean. If true, the connection was initiated by this node.
 - `peer`. Object describing the peer. Will be null if `client === false`.
   - `id`. Buffer. The ID of the remote peer.
   - `topic`. Buffer. The identifier which this peer was discovered under.

#### `net.on('disconnection', (socket, details) => {})`

Detect a disconnection from a peer.



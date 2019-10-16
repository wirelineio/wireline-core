# Wireline Broadcast

Allows a node to originate a message that will be received at least once, within a
reasonably short time, on all nodes that are reachable from the origin node. Messages are
propagated via the middleware specified. Broadcast storms are
avoided by means of a [flooding](https://en.wikipedia.org/wiki/Flooding_(computer_networking)) routing scheme.

Broadcast messages have the following fields:

```proto
message Packet {
  required bytes seq = 1;
  bytes data = 2;
  bytes from = 3;
}
```

- `seq` field by default is a random 32-bit to identify a the message.
- `data` field is an opaque blob of data, it can contain any data that the publisher wants
it to defined by higher layers (e.g. a presence information message).
- `from` is the origin node's unique id within the p2p network.

Nodes send any message originating locally to all current peers. Upon receiving a message, a
node delivers it locally to any listeners, and forward the message on to its current
peers, excluding the peer from which it was received.

Nodes maintain a record of the messages they have received and originated
recently, by `msgId(seq + from)`, and the set of peers to which each message has already
been sent. This is used to avoid sending the same message to the same peer
more than once. These records expire after some time to limit memory consumption.

> Broadcast messages.

## Install

```
$ npm install @wirelineio/broadcast
```

## Usage

```
```

## Contributing

PRs accepted.

## License

GPL-3.0 © Wireline


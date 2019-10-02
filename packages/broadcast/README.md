# Wireline Broadcast

Allows a node to originate a message that will be received at least once, within a reasonably short time, on all nodes that are reachable from the origin node. Messages are propagated via a Dat replication protocol extension. Broadcast storms are avoided by means of a [flooding](https://en.wikipedia.org/wiki/Flooding_(computer_networking)) routing scheme.

Broadcast messages have the following fields : `origin_node_id` , `message_id` , `payload_message` where `origin_node_id` is the origin node's unique id within the p2p network; `message_id` is a 32-byte random id generated at the origin node and intended to be unique within the network; and  `payload_message` is an arbitrary sequence of bytes defined by higher layers (e.g. a presence information message).

Nodes send any message originating locally to all current peers. Upon receiving a message, a node delivers it locally to any listeners, and sends the message on to its current peers, excluding the peer from which it was received.

Nodes maintain a record of the messages they have received and originated recently, by `message_id`, and the set of peers to which each message has already been sent. This is used to avoid sending the same message to the same peer more than once. These records expire after some time to limit memory consumption.

> Broadcast messages.

## Install

```
```

## Usage

```
```

## Contributing

PRs accepted.

## License

GPL-3.0 © Wireline


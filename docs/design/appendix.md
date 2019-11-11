# Appendix

## Swarming & Dat Protocol Handshake

* Swarming means discovering and connecting to peers based on a common topic. 
* Once peers are connected to each other, they talk to each other over the Dat protocol to exchange data.
* The Hypercore (Dat) protocol stream is piped into the connection stream provided by the Swarm infrastructure.
* A Hypercore protocol stream is created for each connected peer.
* The Swarm [connection event](https://github.com/hyperswarm/hyperswarm#swarmonconnection-socket-details--) is asymmetric in terms of the data provided to the event handler.
* Only the client (initiating) side gets the `peer` object, which contains the `topic` the connection was established for.
* In order for the protocol handshake to be successful, each side needs to share the same initial (i.e. first) [feed](https://github.com/mafintosh/hypercore-protocol#var-feed--streamfeedkey).
* Note that sharing a feed doesn't send the feed key to the other side, but only a hash of the key, called a discovery key.
* The key of the first feed is also used to encrypt the stream.
* Typically, the swarming topic is a hash of the initial feed key.
* Hashing the feed key ensures peers can discover each other without revealing the feed key to the world.
* Given an arbitrary swarm connection event, the client side knows what the topic is (from the `peer` object) and can use that to share the initial feed on the protocol stream.
* In the case of the non-client side, there is no `peer` object, so we have to use a trick to figure out which topic the connection was created for.
* The non-client side waits for a [feed event](https://github.com/mafintosh/hypercore-protocol#streamonfeed-discoverykey).
* The feed event is triggered once the peer has shared its initial feed.
* On the feed event, the node receives a discovery key (not the feed key).
* This discovery key can be used to lookup the corresponding feed key locally, if one exists.
* If a feed key is found, it's shared as the initial feed and leads to a successful handshake between the peers.
* If a feed key is not found, there's no way to proceed and the protocol stream is destroyed after a timeout.

## References

* [Hypercore Protocol](https://github.com/mafintosh/hypercore-protocol) - Stream that implements the hypercore protocol.
* [Hyperswarm](https://github.com/hyperswarm/hyperswarm) - A high-level API for finding and connecting to peers who are interested in a topic.
* [Dat protocol](https://datprotocol.github.io/how-dat-works/) - a protocol for sharing data between computers.

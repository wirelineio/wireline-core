# Replication

This document describes the sequence of events that take place in the system to replicate the set of feeds (hypercores) belonging to a party.

* `Megafeed#addParty` emits a `party` event.
* `dsuite-core` (swarm.js) handles this event and triggers `swarm#join`.
* Discovery Swarm WebRTC (which implents the `join` method) sends a `discover` request to the Signal Server.
* Upon discovery of candidates, the Signal Server client emits the `discover` event.
* A random subset is picked from the candidates and a `connect` request is sent to them via the Signal Server.
* Once the peer has accepted the request, a fully signalled WebRTC connection is available.
* The WebRTC peer connection fires a `connect` event when the WebRTC data channel is ready to use.
* A party replication stream, provided by `Megafeed#replicate` is connected (`pump`-ing of duplex streams) with the WebRTC peer connection.
* `Megafeed#replicate` internally calls `Party#replicate`.
* `Party#replicate` creates a hypercore-protocol stream, sets up extensions and shares the first feed, which is the party key.
* Once both sides have shared the same initial feed, it triggers the `handshake` event on the protocol stream.
* The handshake event triggers custom code written in a `party rule` to handle the connection after this point.
* The `document` party rule handles the handshake by sending all feed keys it knows about to the peer using a `party` extension message.
* It also replicates all the feeds it knows about over the party protocol stream created above.
* Once the peer receives the feed keys over the extension message, it creates a local replica of each hypercore using its public key.
* Hypercores replicated over the party protocol stream continue to sync as long as the WebRTC connection is up (due to the `live` replication option).

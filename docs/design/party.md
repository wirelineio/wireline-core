# Party

## Specification

* A party comprises some data realm under a peer-to-peer replication arrangement with eventual consistency supporting 
intermittent connectivity.
* Peer-to-peer replication requires a logical update broadcast mechanism: updates originating at any node are replicated
to all other participating nodes.
* Update broadcast is implemented as a logical set of Dat feeds: one feed originating at each participating node. 
* At each node, a party is a logical set of feeds from one or more peers (party feed set).
* Party replication consists of each node fetching from peers all available feed content over the party feed set.
* Nodes may be added to a party at any time (see Party Membership below) therefore the party feed set is itself 
replicated with eventual consistency.
* Party replication is designed to preserve causal ordering by always fetching all available party set feeds from a peer.
* Each party is identified by a unique identifier called the party key.
* The party key is a public key for which the corresponding private key is used to prove party authority (see below).
* (Note that the party key must not be treated as a bearer authentication token (like regular Dat feed keys are) because
under the party invitation mechanism below, the party key is transmitted in the clear to invitees, however we want
to only admit to the party (including read-only access) nodes that are the subject of the inviting credential.)
* A node may participate in multiple parties at the same time.
* An active party is one that a node is currently interested in and actively replicating with peers.

### Peer Discovery

* Nodes need a way to discover peers that belong to a party they are interested in.
* The discovery mechanism MUST preserve confidentiality (observers MUST not be able to figure out the party key).
* Existing Dat discovery mechanisms such as hyperdiscovery can be leveraged by using the party discovery key as a topic.
* Note that individual feeds (members of the party feed set) are not advertised via discovery. Only the party key is advertised.

### Read-only Participation

* Note that read-only access to a party is feasible. Read-only access means that the participant has been granted 
credentials that permit reading the party feed set, but they do not get to add a feed to the party feed set.

### Party Membership

* A party starts with one participant (the one that created the party).
* The party creator establishes (cryptographically verifiable) ownership over the party and first advertises the party discovery key
via the discovery mechanism.
* New nodes are added to the party using an invitation mechanism.
* Additional nodes also advertise they party discovery key via the discovery mechanism.
* Participation by an additional node in a party is authorized by the party creator.
* Authorization to authorize additional participants is always granted (transitive party invitation authority). This is required
in order to allow new nodes to connect to any existing peer as their greeter node.
* Party invites take the form of decentralized credentials created by the inviter, transmitted to the invitee, authorizing 
another participant (identified by an identity key) to join the party (add their nodes to the party).
* The party key itself is communicated out of band to the invitee (e.g., using a hyperlink or ephemeral message).
* New nodes use the party discovery key to connect to an initial peer (greeter node), present their invitation credential.
* The greeter node validates the invitation credential which it can do because it has the public key of the party 
creator and all currently known transitively authorized nodes. It then provides its current party feed set to the new node
which then proceeds to fetch party feeds.
* The new node verifies the information provided by the greeter node using the party key, which it knew in advance.
* Note there is a problem in that the greeter node can decide to not provide the correct party feed set (censor one or more feeds), or not
provide the latest content is knows for one or more feeds. 
This could probably be solved by publishing the party feed set and current feed sequence numbers under consensus on a 
blockchain every so often.
* In the case of write access being provided to the new node, the greeter node publishes a feed admission message for the new node on its feed.
* New participants may have read-only or read-write access to the party. 
* Finer grained access control is not possible under the party itself, but can be implemented by convention within applications.

### Replication

* A node selects a peer via the discovery mechanism, connects and performs a Dat protocol handshake for the party key, which it knows.
* Peers MUST present to connecting peers all the feed content they have for all feeds in their current party feed set.
* Nodes must check party validity which consists of checking the genesis block vs the party key then checking all 
subsequent chained messages and invitation authorizations.
* Nodes maintain their version of the party feed list by processing party feed authorization messages received on all current party feeds.
* Peers have full control over what feeds they fetch (i.e. the decision is made locally).
* Feed content replication is done with regular Dat protocol. 

### Technical Requirements

* It MUST be possible to replicate multiple parties over a single connection between two peers.
* Multiple types of connection transports should be supported (e.g., WebRTC, TCP & Bluetooth).
* Certain peers may replicate parties over multiple transports to bridge heterogeneous networks.

## Design Notes

### Party Creation & Ownership

* A new PKI key pair is generated by the party creator.
* The public key becomes the party key.
* The private key is used to sign the genesis block, described below.
* The genesis block is the first message (in the first feed) in the party.
* It assigns ownership of the party to the creator and is cryptographically signed with the private key.
* The private key can then be burned.

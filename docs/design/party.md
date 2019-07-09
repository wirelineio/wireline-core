# Party

## Specification

1. A party comprises some data realm under a peer-to-peer replication arrangement with eventual consistency supporting intermittent connectivity.
2. Peer-to-peer replication requires a logical update broadcast mechanism: updates originating at any node are replicated to all other participating nodes.
3. Update broadcast is implemented as a logical set of Dat feeds: one feed originating at each participating node.
4. Each node has a single identity asosciated with it, but an identity can have multiple nodes. 
4. At each node, a party is a logical set of feeds from one or more peers (party feed set).
5. An identity or a node may participate in multiple parties at the same time.
6. Party replication consists of each node fetching from peers all available feed content over the party feed set.
7. Identities may add nodes or other identities to a party at any time (see Party Membership below) therefore the party feed set is itself replicated with eventual consistency.
8. Identities (and all of their nodes) can be removed from Parties.
9. Party replication is designed to preserve causal ordering by always fetching all available party set feeds from a peer, including the feeds of removed nodes.
10. Each party is identified by a unique identifier called the party key.
11. The party key is a public key for which the corresponding private key is used to prove party authority (see below).
12. (Note that the party key must not be treated as a bearer authentication token (like regular Dat feed keys are) because under the party invitation mechanism below, the party key is transmitted in the clear to invitees, however we want to only admit to the party (including read-only access) nodes that are the subject of the inviting credential.)
13. An active party is one that a node is currently interested in and authorized to actively replicate with peers.
14. Since a single identity will be operating multiple nodes, there must be some form of node sub-grouping within a party.

### Peer Discovery

1. Nodes need a way to discover peers that belong to a party they are interested in.
2. ~~The discovery mechanism MUST preserve confidentiality (observers MUST not be able to figure out the party key).~~
3. Existing Dat discovery mechanisms such as hyperdiscovery can be leveraged by using the party key as a topic.
4. Note that individual feeds (members of the party feed set) are not advertised via discovery. Only the party key is advertised.

### Creating a Party

1. A party feed starts with a single message from the party starter.
2. The party init message contains initial permissions, a timestamp, nonce, and other unspecified options.
3. The party starter uses the hash for the init message as the party key

### Authorization/Permissions

1. Party feed Permissions are applied to identities.
2. The minimum permissions that can be granted to an identity are read and add_node.
3. Identities may optionally have write and add_identity permissions.
4. Nodes are added to parties by the identity that owns them.
5. Nodes can only be granted permissions their owners can apply to them.
6. The only permission applied to nodes is add_feed. Only the identity which owns the node can apply the permission.
7. Finer grained access control is not possible under the party itself, but can be implemented by convention within applications.

### Permission Updates

1. There are two types of permission updates: identity permission updates and node permission updates.
2. An identity permission update contains a party key, a hash/ID of the previous permission update, a list of tuples containing an identity, its permissions, and hash to a proof. This update is implicitly signed by an identity already granted permissions within the specified party.
3. An identitiy permission update proof is a hash to a message on some party feed, that message may be an identity invite on any feed, or an identity permission update from another feed.
4. When a node is submitting an identity permission update for an identity its owner invited, it must first publish the invite to its own feed and reference it in the identity permission update.
5. When a node is submitting an identity permission update for an identity its owner did NOT invite, it must reference an identity permission update or an indentity invite from a feed owned by the inviter. This means at least one node of an inviter must be online to authorize an invitee.
6. A node permission update contains a party key, a list of nodes and their permissions. This update is implicitly signed by an identity granted permissions within the specified party. (See inviting a node for more details.)


### Inviting an Identity

1. Identity invites contain a means to address/connect-to the inviter's nodes, the party key, a timestamp, the hash of a recent identity permissions update, the public key of the identity being invited, and the permissions being granted to that identity. This is communicated out of band to the invitee (e.g., using a hyperlink or ephemeral message).
2. An inviter's node validates the identity invite by ensuring the public key of the invite matches their owner and providing the identity permissions update specified in the invite. IFF, the inviter's node publishes the invite to their feed and provides the party feed set.
3. If the inviter node provided a correct identity permissions update, then the invitee node submits a node permissions update for itself. which the inviter node publishes to its feed.
4. while 3 is occuring the invitee node requests all permissions updates from all the nodes in the party feed by submitting references to its invite and node permissions update on the inviter node's feed.
5. The node responding to the permissions update request should also provide any identity or node permission updates since the requested identity permission update. These nodes only repsond if they find and agree with the invite and node permission updates. 
6. Existing party nodes may not agree on the current state of permissions list or the expiry of an invite, and in turn will not add the identity to their permission list nor will they replicate the node permission message.

### Inviting a Node

1. New nodes are added to the party feed set using node permission updates.
2. Node permission updates are replicated across nodes with the same owner.
3. Additional nodes also advertise the party key via the discovery mechanism.
4. An identity publishes their node permission updates to one of their existing feeds.
5. if an identity has no existing feeds, the node must be added using inviting an identity protocol above.

### Adding a Feed

1. If a node's owner has the write permission, that node may add a feed to the party feed set.
2. add_feed messages contain, a party key, a node id, an identity permissions update from another feed, and a feed id.
3. these messages are gossipped to nodes in the party and published to any existing feeds of the owner.

### Replication

* ~~A node selects a peer via the discovery mechanism, connects and performs a Dat protocol handshake for the party key, which it knows.~~
* ~~Peers MUST present to connecting peers all the feed content they have for all feeds in their current party feed set.~~
* ~~Nodes must check party validity which consists of checking the genesis block vs the party key then checking all subsequent chained messages and invitation authorizations.~~
* ~~Nodes maintain their version of the party feed list by processing party feed authorization messages received on all current party feeds.~~
* ~~Peers have full control over what feeds they fetch (i.e. the decision is made locally).~~
* ~~Feed content replication is done with regular Dat protocol.~~

### Technical Requirements

* It MUST be possible to replicate multiple parties over a single connection between two peers.
* Multiple types of connection transports should be supported (e.g., WebRTC, TCP & Bluetooth).
* Certain peers may replicate parties over multiple transports to bridge heterogeneous networks.

## Design Notes


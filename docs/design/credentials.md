# Credentials

## Overview

Credentials are used to:

* Establish the identity of participants in the network.
* Control participants access to resources.

* Credentials take the form of signed messages, containing one or more assertions.
* A credential is signed with a private key, known only to the message signer.
* A credential can be verified using the public key, known to all participants.

Credentials can be:
 
 * Written to feeds and therefore become part of the party state.
 * Presented using an ephemeral message or connection metadata (`stream.userData`).

## Use Cases

### Parties

* Establish ownership over a new party using a genesis block/message.
* Authorize new members to join the party.
* Control party member access level (read-only, read-write, read-write + invite).
* Control feed replication (by requiring credentials to get a list of topics/feed keys).

### Items

* Establish ownership over a new item using a genesis block/message.
* Application specific access control for items (e.g., play as white in a chess game).

TODO(ashwin): Who creates the keys? Do they represent a user or device?
TODO(ashwin): How is private key used for signatures associated with the feed?

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

## Issues / Questions

TODO(ashwin): What things need an identity? Users, bots, devices, anything else?
TODO(ashwin): Is identity tied to a public key / set of public keys?
TODO(ashwin): How is an identity associated with a feed (e.g. feed X belong to User Y)?

TODO(ashwin): What does a credential look like? Can we just use JWTs?
TODO(ashwin): Are credentials bearer tokens?
TODO(ashwin): How do we prevent replay of credentials?
TODO(ashwin): Do credentials have an expiry time?

TODO(ashwin): Do app specific views (e.g. chess log view) read credentials or only read by a separate credentials view?
TODO(ashwin): What API does the credentials system need to expose to apps?

## Examples

### Chess Game

* Item/game genesis block (signed) and invitations (e.g. credential written to feed A after genesis block before game starts) then written by B to B’s feed accepting the invite/challenge).
* Don’t assume keys in item genesis. Instead need separate generic credential messages. With extendable app scope (e.g. color).

Issues

* Define what goes inside the item genesis block.
* Define what goes inside the game genesis block.
* Define goes inside an invite / accept message.
* Generic credentials - serialize to JSON and send in a protobuf message field?

### Chess Tournament Bot

* Consider a bot that organizes a tournament (within a party).
* At the beginning there are 5 peers plus the tournament bot (total 6).
* The bot creates a game and randomly assigns two players.
* Consider the players also to be bots. They see the invitation message (block) and then start playing.
* The tournament bot creates a new game when the current one ends.

Issues

* How are players identified? We probably don't want to use the feed key, so how are identities associated with a feed key?
* How does the tournament bot know a game has ended? Anything better than requiring it to track all games in progress?

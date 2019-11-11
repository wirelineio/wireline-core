# Credentials

## Overview

A credential is a signed assertion from an authority.

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

## Identifiers and Identities

* There are a lot of things that have WRN identifiers (paddefs, botdefs, protodefs, devices, infrastructure, transactions).
* User and Bots have identities (sovereignty, public/private key pair). They are called Participants.
* Participants could have multiple key pairs.
* Public keys identify participants.
* Note: Participants can create many/separate accounts. Potential Sybil issues with multiple accounts (pseudonyms).
* For each account, there is a single associated username/display name. The name can be changed.
* Each account has a HD key associated with it.
* Multiple keypairs can be created from that HD key.
* Others participants don't/can't know they originate from the same account.

## Identity / Feed Association

* The owner creates a PKI that determines the public key for the feed.
* Owner posts a "genesis" block using the private key to sign the message -- that contains the owning user's public key.
* Note the genesis block could use "burner" PKI (used once to write the block) that contains the user feed, and genesis public keys.
* ISSUE: Key rotation? Post new key block?

## Credential Format

* Protobuf with signed message with claims and context.
* Either string or embedded ANY signed protobuf?
  * https://github.com/wirelineio/credentials/blob/master/src/credentials.test.js
* Use canonicalStringify (`import canonicalStringify from 'canonical-json'`) to generate signature since protobuf serialization doesn't happen till later.

Protobuf Definition:

```
message Credential {
  string type;
  string pubAuthorityKey
  string partyKey
  string pubRecipientKey
  ANY claim
  string signature // signed message of canonicalStringify of above
}
```

Example:

```
{
  type: 'wrn:protobuf:wirelino-credential.Credential',
  pubAuthorityKey: 'xxx',
  partyKey: 'xxx',
  pubRecipientKey: 'xxx',
  claim: { player: 'yyy', role: 'white' },
  signature: '12334234'
}
```

## Q/A & Notes

* Credentials are not bearer tokens. Bearer tokens are opaque strings -- and are (short-lived) secrets.
  * To write anything you must have your private key -- and some credential written on some authority feed (e.g., party owner) that says your corresponding public key is good.
  * To read nodes need to see another credential that references your user id, so that nodes send you data.
* TODO(ashwin): Do credentials have an expiry time?
  * Yes (optional policy of party). TDB.
* TODO(ashwin): Do app specific views (e.g. chess log view) read credentials or only read by a separate credentials view?
  * Yes they must. The credentials form the DAG of messages that are to be processed. (e.g., determine which 2 feeds are playing the game).
  * For example, credentials may have an itemKey field. Apps query for "credential.,chess." filtering by itemKey.

## Attacks

* TODO(ashwin): Could credentials be replayed?
* TODO(ashwin): How do we prevent Sybil attacks (single Participant creating multiple accounts/identities).
* TODO(ashwin): List other possible attacks in this section.

## Issues / Questions

* TODO(ashwin): What API does the credentials system need to expose to apps?
  * The ability to write messages (some of which are credentials).
  * Queries should process credentials to traverse the messages (e.g., valid chess feeds for game).
  * View filters on game, move and credential types based on itemKey.

## Examples

### Chess Game

* Item/game genesis block (signed) and invitations (e.g. credential written to feed A after genesis block before game starts) then written by B to B’s feed accepting the invite/challenge).
* Don’t assume keys in item genesis. Instead need separate generic credential messages. With extendable app scope (e.g. color).

#### Issues

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

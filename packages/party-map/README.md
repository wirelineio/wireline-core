# Wireline PartyMap

[![CircleCI](https://circleci.com/gh/wirelineio/wireline-core.svg?style=svg&circle-token=93ede761391f88aa9fffd7fd9e6fe3b552e9cf9d)](https://circleci.com/gh/wirelineio/wireline-core)
[![npm version](https://badge.fury.io/js/%40wirelineio%2Fparty-map.svg)](https://badge.fury.io/js/%40wirelineio%2Fparty-map)

> Module for manage parties of feeds. A Party is an abstraction on top of the [hypercore-protocol](https://github.com/mafintosh/hypercore-protocol) to provide a way to replicate feeds following a set of rules.

## Install

```
$ npm install @wirelineio/party-map
```

## Usage

```javascript


```

## Background

### Hypercore Protocol Feature/Constraints

1. An hypercore connection beetwen two peers it's established using a public key in common. `The first feed key`.
1. `The first feed key` shared is also used to encrypt the stream.
1. Hypercore Protocol allows to share multiple feeds in a single hypercore connection: `Feed multiplexer`.
1. In order to replicate a feed beetwen two peers, each peer needs to know the key of that feed.
1. Hypercore Protocol provides a way to build `extension` messages on top of it.

### Hypercore Constraints

1. It's single writer.

### Issues/Questions

1. What represent `the first feed key` in our solution?
1. How we share the `the first feed key`?
1. How we talk with other peers to send/receive feeds?
1. How we decide `which feeds` we want to replicate?
1. How we do a multi-writer solution using hypercore?

### Current solutions

#### [Multifeed](https://github.com/kappa-db/multifeed) + [kappa-core](https://github.com/kappa-db/kappa-core)

It's a module for management feeds (writer and reader) and replicate them.

The module uses a global `key` hardcoded or set it by option as `the first feed key`.

When a connection (handshake successful) is established each multifeed `share their entire list of feeds with the other peer`.

It's doesn't have a way to selects which feeds want to share or receive.

Multifeed uses kappa to provide a `multi-writer` solution.

#### [Hyperdb](https://github.com/mafintosh/hyperdb)

It's a module that provides a key/value database on top multiple hypercores.

The database starts with a local initial feed and it uses the key of that feed as `the first feed key`.

The `multi-writer` of Hyperdb works creating a graph of authorized writable feeds. These feeds are the only who are authorized to
write in the database.

When a connection is established, hyperdb share the list of authorized feeds with the other peer. That's how Hyperdb selects
which feeds want to share o receive.

### Our solution

Our solution comes from how Hyperdb does a `selective replication feeds` by authorization and how multifeed + kappa `materialized` the
data inside our feeds. We take the best features of both worlds.



//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Change package name.

const glob = require('./src/glob');
const keys = require('./src/keys');
const locker = require('./src/locker');
const promiseHelp = require('./src/promise-help');

// TODO(burdon): Remove.
module.exports = {

  filterFeedByPattern: glob.filterFeedByPattern,
  parsePartyPattern: glob.parsePartyPattern,

  keyToHex: keys.keyToHex,
  getDiscoveryKey: keys.getDiscoveryKey,
  parseToKeys: keys.parseToKeys,
  keyToBuffer: keys.keyToBuffer,

  Locker: locker,

  callbackPromise: promiseHelp.callbackPromise
};

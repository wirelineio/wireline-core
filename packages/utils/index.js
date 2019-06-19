//
// Copyright 2019 Wireline, Inc.
//

const glob = require('./src/glob');
const keys = require('./src/keys');
const locker = require('./src/locker');
const promiseHelp = require('./src/promise-help');

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

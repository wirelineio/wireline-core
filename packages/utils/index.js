//
// Copyright 2019 Wireline, Inc.
//

const { filterFeedByPattern, parsePartyPattern } = require('./src/glob');
const { keyToHex, getDiscoveryKey, parseToKeys, keyToBuffer } = require('./src/keys');
const Locker = require('./src/locker');
const { callbackPromise } = require('./src/promise-help');
const Repository = require('./src/repository');
const bubblingEvents = require('./src/bubbling-events');
const { Logalytics } = require('./src/logalytics');
const { logUnhandled } = require('./src/unhandled');

module.exports = {

  filterFeedByPattern,
  parsePartyPattern,

  keyToHex,
  getDiscoveryKey,
  parseToKeys,
  keyToBuffer,

  Locker,

  callbackPromise,

  Repository,

  bubblingEvents,

  Logalytics,
  logUnhandled
};

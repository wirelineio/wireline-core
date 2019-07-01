//
// Copyright 2019 Wireline, Inc.
//

const { filterFeedByPattern, parsePartyPattern } = require('./src/glob');
const { keyToHex, getDiscoveryKey, parseToKeys, keyToBuffer } = require('./src/keys');
const Locker = require('./src/locker');
const { callbackPromise } = require('./src/promise-help');
const Repository = require('./src/repository');
const bubblingEvents = require('./src/bubbling-events');
const {
  Logalytics,
  LogalyticsLevel,
  LogalyticsLogger,
  LogalyticsWriter,
  ConsoleWriter,
  DebugWriter,
  LogglyWriter,
} = require('./src/logalytics');

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

  ConsoleWriter,
  DebugWriter,
  LogglyWriter,
  LogalyticsWriter,
  LogalyticsLevel,
  LogalyticsLogger,
  Logalytics
};

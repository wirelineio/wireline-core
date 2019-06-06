//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');

const pNoop = () => Promise.resolve();

class Rules {
  constructor(handler) {
    assert(typeof handler.handshake === 'function', '`handshake` method is required.');
    assert(typeof handler.findFeed === 'function', '`findFeed` method is required.');

    this.handshake = handler.handshake.bind(handler);

    this.findFeed = handler.findFeed;

    this.name = handler.name;

    this.options = handler.options || {};

    this.replicateOptions = handler.replicateOptions || {};

    this.ready = handler.ready ? handler.ready.bind(handler) : pNoop;

    this.remoteIntroduceFeeds = handler.remoteIntroduceFeeds ? handler.remoteIntroduceFeeds.bind(handler) : pNoop;

    this.remoteMessage = handler.remoteMessage ? handler.remoteMessage.bind(handler) : pNoop;
  }
}

module.exports = Rules;

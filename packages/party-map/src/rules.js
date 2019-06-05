//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');

const pNoop = () => Promise.resolve();

class Rules {
  constructor(handler) {
    assert(typeof handler.handshake === 'function', 'Handshake rule method is required.');

    this.handshake = handler.handshake.bind(handler);

    this.name = handler.name;

    this.options = handler.options || {};

    this.replicateOptions = handler.replicateOptions || {};

    this.remoteIntroduceFeeds = handler.remoteIntroduceFeeds ? handler.remoteIntroduceFeeds.bind(handler) : pNoop;

    this.remoteMessage = handler.remoteMessage ? handler.remoteMessage.bind(handler) : pNoop;
  }
}

module.exports = Rules;

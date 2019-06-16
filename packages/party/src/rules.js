//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');

const pNoop = () => Promise.resolve(null);

// TODO(burdon): Why does this class exist?
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

    this.onIntroduceFeeds = handler.onIntroduceFeeds ? handler.onIntroduceFeeds.bind(handler) : pNoop;

    this.onEphemeralMessage = handler.onEphemeralMessage ? handler.onEphemeralMessage.bind(handler) : pNoop;

    this.onRequest = handler.onRequest ? handler.onRequest.bind(handler) : pNoop;
  }
}

module.exports = Rules;

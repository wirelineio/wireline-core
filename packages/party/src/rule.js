//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');

const pNoop = () => Promise.resolve(null);

class Rule {
  /**
   *
   * @param {Object} options
   * @param {Function} options.handshake
   * @param {Function} options.findFeed
   * @param {String} options.name
   * @param {Object} options.options
   * @param {Object} options.replicateOptions
   * @param {Function} options.ready
   * @param {Function} options.onIntroduceFeeds
   * @param {Function} options.onEphemeralMessage
   * @param {Function} options.onRequest
   */
  constructor(options) {
    assert(typeof options.handshake === 'function', '`handshake` method is required.');
    assert(typeof options.findFeed === 'function', '`findFeed` method is required.');

    this.handshake = options.handshake.bind(options);

    this.findFeed = options.findFeed;

    this.name = options.name;

    this.options = options.options || {};

    this.replicateOptions = options.replicateOptions || {};

    this.ready = options.ready ? options.ready.bind(options) : pNoop;

    this.onIntroduceFeeds = options.onIntroduceFeeds ? options.onIntroduceFeeds.bind(options) : pNoop;

    this.onEphemeralMessage = options.onEphemeralMessage ? options.onEphemeralMessage.bind(options) : pNoop;

    this.onRequest = options.onRequest ? options.onRequest.bind(options) : pNoop;
  }
}

module.exports = Rule;

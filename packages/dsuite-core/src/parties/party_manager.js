//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');

const { getDiscoveryKey, keyToHex, keyToBuffer } = require('@wirelineio/utils');

/**
 * Manages party-related state.
 */
class PartyManager extends EventEmitter {

  // TODO(burdon): Refactor this abstraction into megafeed/party.

  // TODO(burdon): Move to Megafeed.
  // eslint-disable-next-line class-methods-use-this
  static getPartyName(partyKey, feedKey) {
    const partyKeyHex = keyToHex(partyKey);
    const feedKeyHex = keyToHex(feedKey);

    // TODO(burdon): Extract constants for names (e.g., 'party-feed', 'control-feed').
    return `party-feed/${partyKeyHex}/${feedKeyHex}`;
  }

  constructor(dsuite, mega, core) {
    super();

    console.assert(mega);
    console.assert(core);

    // TODO(burdon): Remove (required for events).
    this._dsuite = dsuite;

    this._mega = mega;
    this._core = core;

    this._currentPartyKey = null;
  }

  // TODO(burdon): Currently only supports one party at a time?
  get currentPartyKey() {
    return this._currentPartyKey;
  }

  isPartyLocal(key, partyKey) {
    const feed = this.getLocalPartyFeed(partyKey || this._currentPartyKey);

    return feed && key === feed.key.toString('hex');
  }

  getPartyKeyFromFeedKey(key) {
    const feed = this._mega.feedByDK(getDiscoveryKey(key));
    if (feed) {
      const args = feed.name.split('/');
      return args[1];
    }

    return null;
  }

  getLocalPartyFeed(partyKey) {
    const name = PartyManager.getPartyName(partyKey, 'local');
    return this._mega.feed(name);
  }

  async connectToParty({ key }) {
    const partyKey = keyToHex(key);

    await this.createLocalPartyFeed(partyKey);

    // Bind the control profile with the party that we are going to connect to.
    await this._core.api['participants'].bindControlProfile({ partyKey });

    return this._mega.addParty({
      rules: 'dsuite:documents',
      key: keyToBuffer(key)
    });
  }

  async connectToBot({ key }) {
    return this._mega.addParty({
      rules: 'dsuite:bot',
      key: keyToBuffer(key)
    });
  }

  async createLocalPartyFeed(partyKey) {
    const feed = this.getLocalPartyFeed(partyKey);
    if (feed) {
      return feed;
    }

    const name = PartyManager.getPartyName(partyKey, 'local');
    return this._mega.addFeed({ name, load: false });
  }

  /**
   * @param opts {Object}
   * @param opts.key {Buffer} Party Key.
   */
  async setParty({ key }) {
    const party = this._mega.party(key);
    if (!party) {
      await this.connectToParty({ key });
      await this._mega.loadFeeds(`party-feed/${key.toString('hex')}/*`);
    }

    if (this._currentPartyKey !== key) {
      this._currentPartyKey = key;
      const feed = this.getLocalPartyFeed(key);

      // TODO(burdon): Document events. Prefer Typed map of event names.
      this._dsuite.emit('party-changed', { partyKey: key, feed });
    }
  }
}

module.exports = PartyManager;

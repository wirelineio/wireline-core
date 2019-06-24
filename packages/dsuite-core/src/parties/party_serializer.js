//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');
const multi = require('multi-read-stream');
const pump = require('pump');
const sorter = require('stream-sort');

const { keyToBuffer, keyToHex } = require('@wirelineio/utils');

const PartyManager = require('../parties/party_manager');

/**
 * Import/export parties.
 */
class PartySerializer {

  // TODO(burdon): Refactor into party module.

  constructor(mega, core, partyManager) {
    this._mega = mega;
    this._core = core;
    this._partyManager = partyManager;
  }

  /**
   * Serialize party to buffer.
   *
   * @param partyKey
   * @return {Promise<Buffer>}
   */
  async serializeParty(partyKey = this._partyManager.currentPartyKey) {

    // TODO(burdon): Change FeedMap abstraction so that it doesn't trigger kappa by default.
    // Load the feeds `({ silent: true })` without notifying kappa.
    const partyFeeds = await this._mega.loadFeeds(PartyManager.getPartyName(partyKey, '**'), { silent: true });

    // Read the messages from all party feeds.
    const reader = multi.obj(partyFeeds.map(feed => feed.createReadStream()));

    return new Promise((resolve, reject) => {
      const writable = pump(
        reader,
        sorter({
          count: Infinity,
          compare: (a, b) => a.timestamp - b.timestamp
        }),
        (err) => {
          if (err) {
            return reject(err);
          }

          return resolve(Buffer.from(JSON.stringify(writable.get())));
        }
      );
    });
  }

  /**
   * Deserialize buffer to rehydrate party.
   *
   * @param partyKey
   * @param buffer
   * @return {Promise<{}>}
   */
  async deserializeParty({ partyKey = crypto.randomBytes(32), buffer }) {
    const messages = JSON.parse(buffer);

    const feed = await this._mega.addFeed({
      name: PartyManager.getPartyName(partyKey, 'local'),
      load: false,
      silent: true
    });

    await Promise.all(
      messages
        .filter(message => !message.type.includes('bind-profile'))
        .map(message => feed.pAppend(message))
    );

    await this._core.api['participants'].bindControlProfile({ partyKey: keyToHex(partyKey) });

    await this._mega.addParty({
      rules: 'dsuite:documents',
      key: keyToBuffer(partyKey)
    });

    return partyKey;
  }
}

module.exports = PartySerializer;

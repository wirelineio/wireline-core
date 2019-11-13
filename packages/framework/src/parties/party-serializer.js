//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('hypercore-crypto');
const multi = require('multi-read-stream');
const pump = require('pump');
const sorter = require('stream-sort');
const pify = require('pify');

const { keyToHex } = require('@wirelineio/utils');


/**
 * Import/export parties.
 */
class PartySerializer {

  constructor(mega, partyKey) {
    this._megafeed = mega;
    this._partyKey = partyKey;
  }

  /**
   * Serialize party to buffer.
   *
   * @param {Buffer} partyKey
   * @return {Promise<Buffer>}
   */
  async serializeParty() {
    const topic = keyToHex(this._partyKey);

    const partyFeeds = await this._megafeed.filterFeeds(descriptor => descriptor.metadata.topic === topic);

    // Read the messages from all party feeds.
    const reader = multi.obj(partyFeeds.map(feed => feed.createReadStream()));

    // TODO(burdon): Timestamp is a hack.
    const timestampSorter = sorter({ count: Infinity, compare: (a, b) => a.timestamp - b.timestamp });

    return new Promise((resolve, reject) => {
      const writable = pump(reader, timestampSorter, (err) => {
        if (err) {
          return reject(err);
        }

        const messages = writable.get().filter(message => !message.type.startsWith('contact.'));

        const buffer = Buffer.from(JSON.stringify(messages));
        return resolve(buffer);
      });
    });
  }

  /**
   * Deserialize buffer to party.
   *
   * @param {Buffer} buffer
   * @param {Buffer} partyKey
   * @return {Promise<{}>}
   */
  async deserializeParty(buffer, partyKey) {
    if (!partyKey) {
      partyKey = crypto.randomBytes(32);
    }

    const topic = keyToHex(partyKey);

    const messages = JSON.parse(buffer);

    const feed = await this._megafeed.openFeed(`feed/${topic}/local`, { metadata: { topic } });

    await Promise.all(messages.map(message => pify(feed.append.bind(feed))(message)));

    return partyKey;
  }
}

module.exports = PartySerializer;

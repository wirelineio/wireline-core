//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const ram = require('random-access-memory');
const levelup = require('levelup');
const memdown = require('memdown');

const { Megafeed, KappaManager } = require('@wirelineio/megafeed2');
const { keyToHex } = require('@wirelineio/utils');

const { ViewTypes, Views } = require('./views/defs');
const ViewManager = require('./views/view-manager');

const { createSwarm } = require('./wrappers/swarm');

/**
 * App framework.
 */
class Framework extends EventEmitter {

  /**
   * TODO(burdon): Remove.
   * @param [conf.name] {String} Name. If provided, profile will be set on contacts view.
   *
   * @param conf.storage {Function} A random-access-* implementation for storage.
   * @param conf.keys {Object}
   * @param conf.keys.publicKey {Buffer}
   * @param conf.keys.secretKey {Buffer}
   * @param conf.hub {String|Array} Signalhub url for swarm connection.
   * @param conf.isBot {Boolean} Sefines if dsuite is for a bot.
   * @param conf.partyKey {Buffer} Sefines initial party key.
   * @param conf.maxPeers {Number} Maximum connections on swarm. Optional. Defaults: If isBot is true it is set to 64 otherwise 2.
   */
  // TODO(burdon): Non-optional variables (e.g., storage) should be actual params.
  constructor(conf = {}) {
    super();
    console.assert(Buffer.isBuffer(conf.partyKey));

    this._conf = conf;

    const { db, keys, storage = ram } = this._conf;

    // Created on initialize.
    this._swarm = null;

    //
    // Megafeed
    //

    // Create megafeed.
    const { publicKey, secretKey } = keys || {};
    this._mega = new Megafeed(storage, {
      publicKey,
      secretKey,
      valueEncoding: 'json'
    });

    // Metrics.
    this._mega.on('append', (feed) => {
      this.emit('metric.mega.append', { value: feed.key.toString('hex') });
    });

    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Create KappaManager.
    this._kappaManager = new KappaManager(this._mega);

    // Create a single Kappa instance
    const topic = keyToHex(this._conf.partyKey);
    this._kappa = this._kappaManager.getOrCreateKappa(topic);

    // Create a ViewManager
    this._viewManager = new ViewManager(this._kappa, this._db)
      .registerTypes(ViewTypes)
      .registerViews(Views);

    this._initialized = false;
  }

  //
  // Accessors
  //

  get swarm() {
    return this._swarm;
  }

  get mega() {
    return this._mega;
  }

  get kappa() {
    return this._kappa;
  }

  get viewManager() {
    return this._viewManager;
  }

  async initialize() {
    console.assert(!this._initialized);
    const topic = keyToHex(this._conf.partyKey);

    await this._mega.initialize();

    // We set the feed where we are going to write messages.
    const feed = await this._mega.openFeed(`feed/${topic}/local`, { metadata: { topic } });
    this._viewManager.setFeed(feed);

    // Connect to the swarm.
    this._swarm = createSwarm(this._mega, this._conf);

    // Set Profile if name is provided.
    const { name } = this._conf;
    if (name) {
      const profile = await this._kappa.api['contacts'].getProfile();
      if (!profile || profile.data.username !== name) {
        await this._kappa.api['contacts'].setProfile({ data: { username: name } });
      }
    }

    this._initialized = true;
    this.emit('ready');
    return this;
  }
}

module.exports = Framework;

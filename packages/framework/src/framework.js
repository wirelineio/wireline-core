//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const ram = require('random-access-memory');
const levelup = require('levelup');
const memdown = require('memdown');
const pify = require('pify');

const { bubblingEvents, keyToHex } = require('@wirelineio/utils');

const { Megafeed, KappaManager } = require('@wirelineio/megafeed2');
const { ViewTypes, Views } = require('./views/defs');
const ViewManager = require('./views/view_manager');

const PartyManager = require('./parties/party_manager');
const PartySerializer = require('./parties/party_serializer');

const botPartyRules = require('./parties/bots');
const documentPartyRules = require('./parties/documents');

const { createSwarm, addSwarmHandlers } = require('./wrappers/swarm');

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
   * @param conf.key.publicKey {Buffer}
   * @param conf.key.secretKey {Buffer}
   * @param conf.hub {String|Array} Signalhub url for swarm connection.
   * @param conf.isBot {Boolean} Sefines if dsuite is for a bot.
   * @param conf.partyKey {Buffer} Sefines initial party key.
   * @param conf.maxPeers {Number} Maximum connections on swarm. Optional. Defaults: If isBot is true it is set to 64 otherwise 2.
   */
  // TODO(burdon): Non-optional variables (e.g., storage) should be actual params.
  constructor(conf = {}) {
    super();

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
      feedOptions: { valueEncoding: 'json' }
    });

    // Metrics.
    this._mega.on('append', (feed) => {
      this.emit('metric.mega.append', { value: feed.key.toString('hex') });
    });

    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Create KappaManager.
    this._kappaManager = new KappaManager(this._mega);

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
    await this._mega.initialize();

    // Initialize control feed of the user.
    await this._mega.openFeed('feed/profiles/local');

    // Load initial feeds. Default is to lazy load feeds on connection.
    await this._mega.loadFeeds(descriptor => descriptor.path.includes('feed/profiles/'));

    // Create a single kappa by a topic = partyKey.
    const topic = keyToHex(this._conf.partyKey);
    this._kappa = await this._kappaManager.getOrCreateKappa(topic);
    await this._mega.openFeed(`feed/${topic}/local`, { metadata: { topic } });

    // Create a ViewManager
    this._viewManager = new ViewManager(this._mega, this._kappa, this._db)
      .registerTypes(ViewTypes)
      .registerViews(Views);

    // Connect to the swarm.
    this._swarm = createSwarm(this._mega, this._conf);

    // TODO(burdon): Remove (use event bubbling?)
    addSwarmHandlers(this._swarm, this._mega, this);

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

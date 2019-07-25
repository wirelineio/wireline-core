//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const ram = require('random-access-memory');
const levelup = require('levelup');
const memdown = require('memdown');
const pify = require('pify');
const crypto = require('hypercore-crypto');

const { Megafeed, KappaManager } = require('@wirelineio/megafeed');
const { keyToHex } = require('@wirelineio/utils');

const PartySerializer = require('./parties/party-serializer');
const { ViewTypes, Views } = require('./views/defs');
const ViewManager = require('./views/view-manager');
const { createSwarm } = require('./wrappers/swarm');
const { getProfile, setProfile } = require('./utils/profile');

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

    const { db, keys = crypto.keyPair(), storage = ram } = this._conf;
    console.assert(keys.publicKey);
    console.assert(keys.secretKey);

    // Created on initialize.
    this._swarm = null;

    //
    // Megafeed
    //

    // Create megafeed.
    const { publicKey, secretKey } = keys;
    this._mega = new Megafeed(storage, {
      publicKey,
      secretKey,
      valueEncoding: 'json'
    });

    // Import/export
    this._partySerializer = new PartySerializer(this._mega, this._conf.partyKey);

    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Create KappaManager.
    this._kappaManager = new KappaManager(this._mega);

    // Create a single Kappa instance
    const topic = keyToHex(this._conf.partyKey);
    this._kappa = this._kappaManager.getOrCreateKappa(topic);

    // Create a ViewManager
    this._viewManager = new ViewManager(this._kappa, this._db, publicKey)
      .registerTypes(ViewTypes)
      .registerViews(Views);

    this._initialized = false;
  }

  //
  // Accessors
  //

  /**
   * Author key representing the identity of the user in the network
   *
   * This is not a final solution. It's a hack to identify the user.
   *
   * @prop {Buffer}
   *
   */
  get key() {
    return this._mega.key;
  }

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

  get partySerializer() {
    return this._partySerializer;
  }

  async initialize() {
    console.assert(!this._initialized);
    const topic = keyToHex(this._conf.partyKey);

    await this._mega.initialize();

    // We set the feed where we are going to write messages.
    const feed = await this._mega.openFeed(`feed/${topic}/local`, { metadata: { topic } });
    this._viewManager.setWriterFeed(feed);

    // We need to load all the feeds with the related topic
    await this._mega.loadFeeds(({ stat }) => stat.metadata.topic === topic);

    // Connect to the swarm.
    this._swarm = createSwarm(this._mega, this._conf, this.emit.bind(this));

    await pify(this._kappa.ready.bind(this._kappa))();

    // Set Profile if name is provided.
    const profile = await this._kappa.api['contacts'].getProfile();
    if (!profile) {
      const lastProfile = getProfile(this._mega.key);
      const name = lastProfile ? lastProfile.data.username : this._conf.name;
      const msg = await this._kappa.api['contacts'].setProfile({ data: { username: name } });
      setProfile(this._mega.key, msg);
      this._kappa.api['contacts'].events.on('profile-updated', (msg) => {
        setProfile(this._mega.key, msg);
      });
    }

    this._initialized = true;
    this.emit('ready');
    return this;
  }
}

module.exports = Framework;

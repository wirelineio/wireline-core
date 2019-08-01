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
const { keyToHex, getDiscoveryKey } = require('@wirelineio/utils');

const PartySerializer = require('./parties/party-serializer');
const { ViewTypes, Views } = require('./views/defs');
const ViewManager = require('./views/view-manager');
const createSwarm = require('./wrappers/swarm');

const packageJSON = require('../package.json');

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
   * @param conf.isBot {Boolean} Flag for bot peers.
   * @param conf.partyKey {Buffer} Initial party key.
   * @param conf.maxPeers {Number} Maximum connections on swarm. Optional. Defaults: If isBot is true it is set to 64 otherwise 2.
   * @param conf.name {String} Name for the default profile.
   */
  // TODO(burdon): Non-optional variables (e.g., storage) should be actual params.
  constructor(conf = {}) {
    super();

    this._conf = conf;

    const { db, partyKey, keys = crypto.keyPair(), storage = ram, name } = this._conf;
    console.assert(Buffer.isBuffer(partyKey));
    console.assert(keys.publicKey);
    console.assert(keys.secretKey);
    console.assert(name);

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
    this._partySerializer = new PartySerializer(this._mega, partyKey);

    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Create KappaManager.
    this._kappaManager = new KappaManager(this._mega);

    // Create a single Kappa instance
    const topic = keyToHex(partyKey);
    this._kappa = this._kappaManager.getOrCreateKappa(topic);

    // Create a ViewManager
    this._viewManager = new ViewManager(this._kappa, this._db, publicKey)
      .registerTypes(ViewTypes)
      .registerViews(Views);

    const megaExtensions = [
      this._mega.createExtensions.bind(this._mega)
    ];

    this._swarm = createSwarm(conf.id || this._mega.id, conf.partyKey, {
      swarm: conf.swarm,
      hub: conf.hub,
      ice: conf.ice,
      maxPeers: conf.maxPeers,
      emit: this.emit.bind(this),
      extensions: conf.extensions
        ? [...conf.extensions, ...megaExtensions]
        : megaExtensions,
    });

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

  toString() {
    const meta = {
      version: packageJSON.version
    };

    return `Framework(${JSON.stringify(meta)})`;
  }

  async initialize() {
    console.assert(!this._initialized);
    const { partyKey, name } = this._conf;
    const topic = keyToHex(partyKey);

    await this._mega.initialize();

    // We set the feed where we are going to write messages.
    const feed = await this._mega.openFeed(`feed/${topic}/local`, { metadata: { topic } });
    this._viewManager.setWriterFeed(feed);

    // We need to load all the feeds with the related topic
    await this._mega.loadFeeds(({ stat }) => stat.metadata.topic === topic);

    // Connect to the party.
    this._connect();

    await pify(this._kappa.ready.bind(this._kappa))();

    // Set Profile if name is provided.
    const profile = await this._kappa.api['contacts'].getProfile();
    if (!profile) {
      await this._kappa.api['contacts'].setProfile({ data: { username: name } });
    }
    this._kappa.api['contacts'].events.on('profile-updated', (msg) => {
      this.emit('profile-updated', msg);
    });

    this._initialized = true;
    this.emit('ready');
    return this;
  }

  _connect() {
    const { partyKey } = this._conf;

    process.nextTick(() => {
      const value = { key: partyKey.toString('hex'), dk: getDiscoveryKey(partyKey).toString('hex') };
      this._swarm.join(value.dk);
      this.emit('metric.swarm.party', { value });
    });
  }
}

module.exports = Framework;

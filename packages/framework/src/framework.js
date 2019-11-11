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
const PartyManager = require('./parties/party-manager');
const { ViewTypes, Views } = require('./views/defs');
const ViewManager = require('./views/view-manager');
const createSwarm = require('./wrappers/swarm');

const packageJSON = require('../package.json');

/**
 * App framework.
 */
// TODO(burdon): Requires test.
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
  constructor(conf = {}) {
    super();

    this._conf = conf;

    // TODO(burdon): Non-optional variables (e.g., storage) should be actual params.
    const { id, name, partyKey, db, keys = crypto.keyPair(), storage = ram } = this._conf;
    console.assert(!id || (id && Buffer.isBuffer(id)));
    console.assert(Buffer.isBuffer(partyKey));
    console.assert(keys.publicKey);
    console.assert(keys.secretKey);

    // TODO(burdon): Remove.
    console.assert(name);

    this._id = id || keys.publicKey;

    // Create megafeed.
    const { publicKey, secretKey } = keys;
    this._megafeed = new Megafeed(storage, {
      publicKey,
      secretKey,
      valueEncoding: 'json'
    });

    // Import/export
    // TODO(burdon): Don't set initial party (use connect below).
    this._partySerializer = new PartySerializer(this._megafeed, partyKey);
    this._partyManager = new PartyManager(partyKey);

    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Kappa stores.
    // TODO(burdon): Move async to initialize.
    this._kappaManager = new KappaManager(this._megafeed);
    this._kappa = this._kappaManager.getOrCreateKappa(keyToHex(partyKey));

    // Manage views.
    this._viewManager = new ViewManager(this._kappa, this._db, this._id)
      .registerTypes(ViewTypes)
      .registerViews(Views);

    // Swarm.
    const standardExtensions = [
      this._megafeed.createExtensions.bind(this._megafeed)
    ];

    const { swarm, hub, ice, maxPeers, extensions = [] } = this._conf;
    this._swarm = createSwarm(this._id, partyKey, {
      swarm,
      hub,
      ice,
      maxPeers,
      extensions: [...extensions, ...standardExtensions],
      discoveryToPublicKey: dk => this._partyManager.findPartyByDiscovery(dk),
      emit: this.emit.bind(this)
    });

    this._initialized = false;
  }

  //
  // Accessors
  // TODO(burdon): Restrict accessors.
  //

  /**
   * Hack to identity peer on the network.
   */
  // TODO(burdon): Rename.
  get id() {
    return this._id;
  }

  get key() {
    return this._megafeed.key;
  }

  get swarm() {
    return this._swarm;
  }

  // TODO(burdon): Rename megafeed.
  get mega() {
    return this._megafeed;
  }

  // TODO(burdon): Remove access?
  get kappa() {
    return this._kappa;
  }

  get viewManager() {
    return this._viewManager;
  }

  get partySerializer() {
    return this._partySerializer;
  }

  get partyManager() {
    return this._partyManager;
  }

  toString() {
    const meta = {
      version: packageJSON.version
    };

    return `Framework(${JSON.stringify(meta)})`;
  }

  async initialize() {
    console.assert(!this._initialized);

    //
    // Megafeed
    //

    await this._megafeed.initialize();

    // TODO(burdon): Don't assume party; call this externally.
    const { partyKey } = this._conf;
    const topic = keyToHex(partyKey);

    // Set the feed where we are going to write messages.
    const feed = await this._megafeed.openFeed(`feed/${topic}/local`, { metadata: { topic } });
    this._viewManager.setWriterFeed(feed);

    // Load all feeds with the related topic.
    await this._megafeed.loadFeeds(({ stat }) => stat.metadata.topic === topic);

    // Connect to the party.
    const party = this.connect(partyKey);
    this.emit('metric.swarm.party', { key: keyToHex(party.key), dk: keyToHex(party.dk) });

    //
    // Kappa
    //

    // Wait for kappa to initialize.
    await pify(this._kappa.ready.bind(this._kappa))();

    // Set Profile if name is provided.
    // TODO(burdon): User name should not be required by Framework.
    const profile = await this._kappa.api['contacts'].getProfile();
    if (!profile) {
      const { name } = this._conf;
      await this._kappa.api['contacts'].setProfile({ data: { username: name } });
    }

    // TODO(burdon): Remove dependency.
    this._kappa.api['contacts'].events.on('profile-updated', (msg) => {
      this.emit('profile-updated', msg);
    });

    this._initialized = true;
    this.emit('ready');
    return this;
  }

  connect(partyKey) {
    const party = this._partyManager.setParty(partyKey);
    this._swarm.join(party.dk);
    return party;
  }

  disconnect(partyKey) {
    const party = this._partyManager.setParty(partyKey);
    this._swarm.leave(party.dk);
    return party;
  }
}

module.exports = Framework;

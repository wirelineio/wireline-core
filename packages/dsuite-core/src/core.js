//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');
const ram = require('random-access-memory');
const levelup = require('levelup');
const memdown = require('memdown');
const pify = require('pify');

const { bubblingEvents } = require('@wirelineio/utils');

const { ViewTypes, Views } = require('./views');

const PartyManager = require('./parties/party_manager.js');
const PartySerializer = require('./parties/serializer.js');

const botPartyRules = require('./parties/bots.js');
const documentPartyRules = require('./parties/documents.js');

const { createMega } = require('./wrappers/mega');
const { createKappa, createKappaViewAdapter } = require('./wrappers/kappa');
const { createSwarm, addSwarmHandlers } = require('./wrappers/swarm');

/**
 * App framework.
 */
class DSuite extends EventEmitter {

  // TODO(burdon): Remove all external dependencies (passing "this")
  // TODO(burdon): Rename Framework (separate repo or move to appkit?)

  /**
   * DSuite core. Creates kappa views and configs swarming.
   *
   * @param [conf.name] {String} Name. If provided, profile will be set on contacts view.
   * @param conf.storage {Function} A random-access-* implementation for storage.
   * @param conf.keys {Object}
   * @param conf.key.publicKey {Buffer}
   * @param conf.key.secretKey {Buffer}
   * @param conf.hub {String|Array} Signalhub url for swarm connection.
   * @param conf.isBot {Boolean} Sefines if dsuite is for a bot.
   * @param conf.partyKey {Buffer} Sefines initial party key.
   * @param conf.maxPeers {Number} Maximum connections on swarm. Optional. Defaults: If isBot is true it is set to 64 otherwise 2.
   */
  // TODO(burdon): Non-options variables should be actual params.
  constructor(conf = {}) {
    super();

    this._conf = conf;

    const { db, keys, storage = ram } = this._conf;

    // Map of views indexed by name.
    // TODO(burdon): Factor out ViewManager.
    this._views = new Map();

    // Created on initialize.
    this._swarm = null;

    //
    // Megafeed
    //

    const feeds = [
      {
        name: 'control' // TODO(burdon): Factor out consts.
      },
      {
        name: PartyManager.getPartyName(conf.partyKey, 'local'),
        load: false
      }
    ];

    // Create megafeed.
    const { publicKey, secretKey } = keys || {};
    this._mega = createMega(storage, publicKey, secretKey, feeds);

    // Metrics.
    this._mega.on('append', (feed) => {
      this.emit('metric.mega.append', { value: feed.key.toString('hex') });
    });

    //
    // Kappa
    //

    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Create kapp views.
    // TODO(burdon): Rename kappa.
    this._core = createKappa(this._mega, createKappaViewAdapter(this));

    //
    // Parties
    //

    // Manages parties.
    this._partyManager = new PartyManager(this, this._mega, this._core);

    // Import/export
    this._serializer = new PartySerializer(this._core, this._mega, this._partyManager);
  }

  //
  // Accessors
  //

  // TODO(burdon): Remove (pass options as required).
  get conf() {
    return this._conf;
  }

  // TODO(burdon): Required by views.
  get db() {
    return this._db;
  }

  // TODO(burdon): Rename kappa.
  get core() {
    return this._core;
  }

  get mega() {
    return this._mega;
  }

  get swarm() {
    return this._swarm;
  }

  get partyManager() {
    return this._partyManager;
  }

  get serializer() {
    return this._serializer;
  }

  //
  // API
  //

  async initialize() {
    // Register kappa views.
    this.registerViews();

    // Initialize control feed of the user.
    await this._mega.addFeed({ name: 'control' });

    // Load initial feeds for the currentPartyKey. Default is to lazy load feeds on connection.
    await this._mega.loadFeeds('control-feed/*');

    // Wait for kappa to initialize.
    await pify(this._core.ready.bind(this._core))();

    // Connect to the swarm.
    this._swarm = createSwarm(this._mega, this._conf);

    // TODO(burdon): Remove (event bubbling).
    addSwarmHandlers(this._swarm, this._mega, this);

    const replicationRules = [
      documentPartyRules({ core: this._core, mega: this._mega, partyManager: this._partyManager }),
      botPartyRules({ conf: this._conf, swarm: this._swarm, partyManager: this._partyManager })
    ];

    replicationRules.forEach(rule => this._mega.setRules(rule));

    bubblingEvents(this, this.partyManager, ['rule-handshake', 'rule-ephemeral-message']);

    // TODO(burdon): Really needs a comment.
    if (this._conf.isBot) {
      await this._partyManager.connectToBot({
        key: this._mega.key
      });
    }

    // TODO(burdon): Need to re-initialize if changed?
    if (this._conf.partyKey) {
      await this._partyManager.setParty({ key: this._conf.partyKey });
    }

    // Set Profile if name is provided.
    const { name } = this._conf;
    if (name) {
      const profile = await this._core.api['contacts'].getProfile();
      if (!profile || profile.data.username !== name) {
        await this._core.api['contacts'].setProfile({ data: { username: name } });
      }
    }

    this.emit('ready');
  }

  //
  // Kappa
  //

  registerViews() {
    // TODO(burdon): Remove plurals.
    // TODO(burdon): Prefer uniform core.api['view-id'] to access (makes it clearer this is a named extension).
    Views.forEach(view => this.registerView(view));
  }

  registerView({ name, view }) {
    if (this.hasView(name)) {
      return this._views.get(name);
    }

    const viewConstructor = (typeof view === 'string') ? ViewTypes[view] : view;

    // TODO(burdon): Remove dependency on this. Pass individual params.
    const adapter = {

      // TODO(burdon): Event bubbling?
      on: this.on.bind(this),

      core: this._core,
      mega: this._mega,
      db: this._db,
      partyManager: this._partyManager
    };

    this._core.use(name, viewConstructor(adapter, { viewId: name }));

    this._views.set(name, this._core.api[name]);
    return this._views.get(name);
  }

  // TODO(burdon): Used by apollo (factor out ViewManager).
  hasView(name) {
    return this._views.has(name);
  }
}

module.exports = DSuite;

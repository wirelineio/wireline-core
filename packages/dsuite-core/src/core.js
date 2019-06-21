//
// Copyright 2019 Wireline, Inc.
//

const { EventEmitter } = require('events');

const kappa = require('kappa-core');
const ram = require('random-access-memory');
const levelup = require('levelup');
const memdown = require('memdown');
const pify = require('pify');

const { Megafeed } = require('@wirelineio/megafeed');
const { bubblingEvents } = require('@wirelineio/utils');

const swarm = require('./swarm');
const { ViewTypes, Views } = require('./views');

const PartyManager = require('./parties/party_manager.js');
const PartySerializer = require('./parties/serializer.js');

const botPartyRules = require('./parties/bots.js');
const documentPartyRules = require('./parties/documents.js');

/**
 * App framework.
 */
class DSuite extends EventEmitter {

  // TODO(burdon): Move to appkit?

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
    const { publicKey: key, secretKey } = keys || {};
    this._mega = new Megafeed(storage, key, {
      valueEncoding: 'json',
      secretKey,
      feeds
    });

    // Metrics.
    this._mega.on('append', (feed) => {
      this.emit('metric.mega.append', { value: feed.key.toString('hex') });
    });

    //
    // Kappa
    //

    // Create kapp views.
    // TODO(burdon): Rename kappa.
    this._core = kappa(null, {
      multifeed: this._mega // TODO(burdon): Create Adapter.
    });

    // TODO(burdon): Remove: create custom view constructor/injector.
    // Sometimes we need access to the dsuite instance in our apollo stores (e.g., IPFS serializer).
    this._core.dsuite = this;

    // TODO(burdon): Required for kappa.
    // In-memory cache for views.
    this._db = db || levelup(memdown());

    //
    // Parties
    //

    // Manages parties.
    this._partyManager = new PartyManager(this, this._mega, this._core);

    // Import/export
    this._serializer = new PartySerializer(this);
  }

  //
  // Kappa API
  // TODO(burdon): Create adapter.
  //

  get _logs() {
    return this._mega;
  }

  get db() {
    return this._db;
  }

  //
  // Accessors
  //

  // TODO(burdon): Remove (pass options as required).
  get conf() {
    return this._conf;
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

    // Initialize control feed of the user.
    await this._mega.addFeed({ name: 'control' });

    // Register kappa views.
    this.registerViews();

    // TODO(burdon): Comment (e.g., this must happen before above).
    await pify(this._core.ready.bind(this._core))();

    // Connect to the swarm.
    // TODO(burdon): Remove factory method and create adapter to manage events.
    this._swarm = swarm(this, this._conf);

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

    const createView = (typeof view === 'string') ? ViewTypes[view] : view;

    this._core.use(name, createView(this, { viewId: name }));

    this._views.set(name, this._core.api[name]);
    return this._views.get(name);
  }

  // TODO(burdon): Used by apollo (factor out ViewManager).
  hasView(name) {
    return this._views.has(name);
  }
}

module.exports = DSuite;

//
// Copyright 2019 Wireline, Inc.
//

const charwise = require('charwise');
const { EventEmitter } = require('events');
const crypto = require('hypercore-crypto');
const kappa = require('kappa-core');
const levelup = require('levelup');
const memdown = require('memdown');
const multi = require('multi-read-stream');
const ram = require('random-access-memory');
const pump = require('pump');
const sorter = require('stream-sort');
const { promisify } = require('util');

const { Megafeed } = require('@wirelineio/megafeed');

const swarm = require('./swarm');
const viewTypes = require('./views');
const botPartyRules = require('./rules/bots.js');
const documentPartyRules = require('./rules/documents.js');

// TODO(burdon): Rename Framework? (and rename variables "core" in other modules (not "kappa", "dsuite").
class DSuite extends EventEmitter {

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
    const { publicKey: key, secretKey } = keys || {};

    // Create megafeed.
    this._mega = new Megafeed(storage, key, {
      feeds: [
        { name: 'control' }, // TODO(burdon): Factor out special name.
        { name: this.getPartyName(conf.partyKey, 'local'), load: false }
      ],
      valueEncoding: 'json',
      secretKey
    });

    // Set the replication rules.
    // TODO(burdon): Remove dependency on this.
    this._mega.setRules(documentPartyRules(this));
    this._mega.setRules(botPartyRules(this));

    // Metrics.
    this._mega.on('append', (feed) => {
      this.emit('metric.mega.append', { value: feed.key.toString('hex') });
    });

    // Create kapp views.
    this._core = kappa(null, {
      // TODO(burdon): Create Adapter.
      multifeed: this._mega
    });

    // TODO(burdon): Remove (or pass required components to stores).
    // Sometimes we need access to the dsuite instance in our apollo stores.
    this._core.dsuite = this;

    // TODO(burdon): Required for kappa.
    // In-memory cache for views.
    this._db = db || levelup(memdown());

    // Map of views indexed by name.
    this._views = new Map();

    // TODO(burdon): Currently only supports one party at a time?
    this._currentPartyKey = null;

    // Created on initialize.
    this._swarm = null;
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

  // TODO(burdon): Move to static util (used by views).
  // eslint-disable-next-line class-methods-use-this
  uuid(...args) {
    return args
      .filter(Boolean)
      .map(charwise.encode)
      .join('!');
  }

  //
  // Accessors
  //

  // TODO(burdon): Remove (pass options as required).
  get conf() {
    return this._conf;
  }

  // TODO(burdon): Remove (use core.api below).
  get api() {
    return this._core.api;
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

  get currentPartyKey() {
    return this._currentPartyKey;
  }

  //
  // API
  //

  async initialize() {

    // Register kappa views.
    this.registerViews();

    // TODO(burdon): Comment (e.g., this must happen before above).
    await promisify(this._core.ready.bind(this._core))();

    // Connect to the swarm.
    // TODO(burdon): Remove factory method and create adapter to manage events.
    this._swarm = swarm(this, this._conf);

    // TODO(burdon): Really needs a comment.
    if (this._conf.isBot) {
      await this.connectToBot({
        key: this._mega.key
      });
    }

    // TODO(burdon): Need to re-initialize if changed?
    if (this._conf.partyKey) {
      await this.setParty({ key: this._conf.partyKey });
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
  // Views
  //

  registerViews() {

    // TODO(burdon): Remove plurals.
    // TODO(burdon): Prefer uniform core.api['view-id'] to access (makes it clearer this is a named extension).

    // System views.

    this.registerView({ name: 'contacts',       view: 'ContactsView' });
    this.registerView({ name: 'participants',   view: 'ParticipantsView' });
    this.registerView({ name: 'items',          view: 'ItemsView' });

    // Dsuite views.

    this.registerView({ name: 'documents',      view: 'DocumentsView' });
    this.registerView({ name: 'presentations',  view: 'DocumentsView' });
    this.registerView({ name: 'sheets',         view: 'DocumentsView' });
    this.registerView({ name: 'graphs',         view: 'LogsView' });
    this.registerView({ name: 'sketch',         view: 'LogsView' });
    this.registerView({ name: 'kanban',         view: 'LogsView' });

    // Custom views.

    this.registerView({ name: 'chess',          view: 'LogsView' });
  }

  registerView({ name, view }) {
    if (this.hasView(name)) {
      return this._views.get(name);
    }

    const createView = (typeof view === 'string') ? viewTypes[view] : view;

    this._core.use(name, createView(this, { viewId: name }));

    this._views.set(name, this._core.api[name]);
    return this._views.get(name);
  }

  hasView(name) {
    return this._views.has(name);
  }

  //
  // Connecting
  //

  async connectToParty({ key }) {
    const partyKey = Megafeed.keyToHex(key);

    // TODO(burdon): Comment.
    await this.createLocalPartyFeed(partyKey);

    // Bind the control profile with the party that we are going to connect to.
    await this._core.api['participants'].bindControlProfile({ partyKey });

    return this._mega.addParty({
      rules: 'dsuite:documents',
      key: Megafeed.keyToBuffer(key)
    });
  }

  async connectToBot({ key }) {
    return this._mega.addParty({
      rules: 'dsuite:bot',
      key: Megafeed.keyToBuffer(key)
    });
  }

  //
  // Parties
  //

  isLocal(key, partyKey) {
    const feed = this.getLocalPartyFeed(partyKey || this._currentPartyKey);

    return feed && key === feed.key.toString('hex');
  }

  // TODO(burdon): Static/util?
  // eslint-disable-next-line class-methods-use-this
  getPartyName(partyKey, feedKey) {
    const partyKeyHex = Megafeed.keyToHex(partyKey);
    const feedKeyHex = Megafeed.keyToHex(feedKey);

    // TODO(burdon): Extract constants for names (e.g., 'party-feed', 'control-feed').
    return `party-feed/${partyKeyHex}/${feedKeyHex}`;
  }

  getPartyKeyFromFeedKey(key) {
    const feed = this._mega.feedByDK(Megafeed.discoveryKey(key));
    if (feed) {
      const args = feed.name.split('/');
      return args[1];
    }

    return null;
  }

  getLocalPartyFeed(partyKey) {
    const name = this.getPartyName(partyKey, 'local');
    return this._mega.feed(name);
  }

  async createLocalPartyFeed(partyKey) {
    const feed = this.getLocalPartyFeed(partyKey);
    if (feed) {
      return feed;
    }

    const name = this.getPartyName(partyKey, 'local');
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
    }

    if (this._currentPartyKey !== key) {
      this._currentPartyKey = key;
      const feed = this.getLocalPartyFeed(key);
      // TODO(burdon): Document events. Prefer Typed map of event names.
      this.emit('party-changed', { partyKey: key, feed });
    }
  }

  //
  // Serialization
  // TODO(burdon): Factor out to megafeed.
  //

  async serializeParty(partyKey = this._currentPartyKey) {

    // TODO(burdon): Change FeedMap abstraction so that it doesn't trigger kappa by default.
    // Load the feeds `({ silent: true })` without notifying kappa.
    const partyFeeds = await this._mega.loadFeeds(this.getPartyName(partyKey, '**'), { silent: true });

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

  // TODO(burdon): Rename deserializeParty?
  async createPartyFromBuffer({ partyKey = crypto.randomBytes(32), buffer }) {
    const messages = JSON.parse(buffer);

    const feed = await this._mega.addFeed({
      name: this.getPartyName(partyKey, 'local'),
      load: false,
      silent: true
    });

    await Promise.all(
      messages
        .filter(message => !message.type.includes('bind-profile'))
        .map(message => feed.pAppend(message))
    );

    await this._core.api['participants'].bindControlProfile({ partyKey: Megafeed.keyToHex(partyKey) });

    await this._mega.addParty({
      rules: 'dsuite:documents',
      key: Megafeed.keyToBuffer(partyKey)
    });

    return partyKey;
  }
}

module.exports = DSuite;

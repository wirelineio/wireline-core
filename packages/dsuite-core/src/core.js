//
// Copyright 2019 Wireline, Inc.
//

const { promisify } = require('util');
const { EventEmitter } = require('events');
const levelup = require('levelup');
const memdown = require('memdown');
const ram = require('random-access-memory');
const kappa = require('kappa-core');
const charwise = require('charwise');
const multi = require('multi-read-stream');
const sorter = require('stream-sort');
const pump = require('pump');
const crypto = require('hypercore-crypto');

const { Megafeed } = require('@wirelineio/megafeed');

const swarm = require('./swarm');

// Kappa views.
const viewTypes = require('./views');

// Party rules.
const setBotPartyRules = require('./rules/bots.js');
const setDocumentPartyRules = require('./rules/documents.js');

// TODO(burdon): Rename WireCore? (and rename variables "core" in other modules (not "kappa", "dsuite").
class DSuite extends EventEmitter {

  /**
   * DSuite core. Creates kappa views and configs swarming.
   *
   * @param conf.name {String} Name. If provided, profile will be set on contacts view. Optional.
   * @param conf.storage {Function} A random-access-* implementation for storage.
   * @param conf.keys {Object}
   * @param conf.key.publicKey {Buffer}
   * @param conf.key.secretKey {Buffer}
   * @param conf.hub {String|Array} Signalhub url for swarm connection.
   * @param conf.isBot {Boolean} Sefines if dsuite is for a bot.
   * @param conf.partyKey {Buffer} Sefines initial party key.
   * @param conf.maxPeers {Number} Maximum connections on swarm. Optional. Defaults: If isBot is true it is set to 64 otherwise 2.
   */
  constructor(conf = {}) {
    super();
    this.conf = conf;

    const { storage = ram, keys } = this.conf;
    const { publicKey: key, secretKey } = keys || {};

    this.currentPartyKey = null;

    // Create megafeed.
    const mega = new Megafeed(storage, key, {
      feeds: [
        { name: 'control' }, // TODO(burdon): Factor out special name.
        { name: this.getPartyName(conf.partyKey, 'local'), load: false }
      ],
      valueEncoding: 'json',
      secretKey
    });

    this.mega = mega;

    // Metrics.
    mega.on('append', (feed) => {
      this.emit('metric.mega.append', { value: feed.key.toString('hex') });
    });

    // Create kapp views.
    const core = kappa(null, {
      multifeed: mega
    });

    // Sometimes we need access to the dsuite instance in our apollo stores
    core.dsuite = this;

    this.core = core;

    // In-memory cache for views.
    this.db = conf.db || levelup(memdown());

    this._views = new Map();

    // TODO(burdon): Remove plurals!

    // System views.

    this.registerView({ name: 'contacts', view: 'ContactsView' });
    this.registerView({ name: 'participants', view: 'ParticipantsView' });
    this.registerView({ name: 'items', view: 'ItemsView' });

    // Dsuite views.

    this.registerView({ name: 'documents', view: 'DocumentsView' });
    this.registerView({ name: 'presentations', view: 'DocumentsView' });
    this.registerView({ name: 'sheets', view: 'DocumentsView' });
    this.registerView({ name: 'graphs', view: 'LogsView' });
    this.registerView({ name: 'sketch', view: 'LogsView' });
    this.registerView({ name: 'kanban', view: 'LogsView' });

    // Custom views.

    this.registerView({ name: 'chess', view: 'LogsView' });

    // TODO(burdon): Comment: what does this do?
    setDocumentPartyRules(this);
    setBotPartyRules(this);
  }

  /* Start api kappa compatibility/ */
  get _logs() {
    return this.mega;
  }

  get api() {
    return this.core.api;
  }
  /* End api kappa compatibility. */

  async initialize() {
    const { core, mega, conf } = this;
    const { name } = conf;

    await promisify(core.ready.bind(core))();

    this.swarm = swarm(this, conf);

    if (conf.isBot) {
      await this.connectToBot({
        key: mega.key
      });
    }

    if (conf.partyKey) {
      // it's a human peer
      await this.setParty({ key: conf.partyKey });
    }

    // Set Profile if name is provided.
    if (name) {
      const profile = await core.api.contacts.getProfile();
      if (!profile || profile.data.username !== name) {
        await core.api.contacts.setProfile({ data: { username: name } });
      }
    }

    this.emit('ready');
  }

  // eslint-disable-next-line class-methods-use-this
  uuid(...args) {
    return args
      .filter(Boolean)
      .map(charwise.encode)
      .join('!');
  }

  // eslint-disable-next-line class-methods-use-this
  getPartyName(partyKey, feedKey) {
    const partyKeyHex = Megafeed.keyToHex(partyKey);
    const feedKeyHex = Megafeed.keyToHex(feedKey);
    return `party-feed/${partyKeyHex}/${feedKeyHex}`;
  }

  getLocalPartyFeed(partyKey) {
    const name = this.getPartyName(partyKey, 'local');

    return this.mega.feed(name);
  }

  async createLocalPartyFeed(partyKey) {
    const feed = this.getLocalPartyFeed(partyKey);

    if (feed) {
      return feed;
    }

    const name = this.getPartyName(partyKey, 'local');
    return this.mega.addFeed({ name, load: false });
  }

  getPartyKeyFromFeedKey(key) {
    const { mega } = this;

    const feed = mega.feedByDK(Megafeed.discoveryKey(key));

    if (feed) {
      const args = feed.name.split('/');
      return args[1];
    }

    return null;
  }

  async connectToParty({ key }) {
    const partyKey = Megafeed.keyToHex(key);

    await this.createLocalPartyFeed(partyKey);

    // We bind our control profile with the party that we are going to connect to.
    await this.core.api.participants.bindControlProfile({ partyKey });

    return this.mega.setParty({
      rules: 'dsuite:documents',
      key: Megafeed.keyToBuffer(key)
    });
  }

  /**
   * @param opts {Object}
   * @param opts.key {Buffer} Bot PublicKey.
   */
  async connectToBot({ key }) {
    return this.mega.setParty({
      rules: 'dsuite:bot',
      key: Megafeed.keyToBuffer(key)
    });
  }

  /**
   * @param opts {Object}
   * @param opts.key {Buffer} Party Key.
   */
  async setParty({ key }) {
    const { mega } = this;

    const party = mega.party(key);

    if (!party) {
      await this.connectToParty({ key });
    }

    if (this.currentPartyKey !== key) {
      this.currentPartyKey = key;
      const feed = this.getLocalPartyFeed(key);
      this.emit('party-changed', { partyKey: key, feed });
    }
  }

  isLocal(key, partyKey) {
    const feed = this.getLocalPartyFeed(partyKey || this.currentPartyKey);
    return feed && key === feed.key.toString('hex');
  }

  hasView(name) {
    return this._views.has(name);
  }

  registerView({ name, view }) {
    let createView = view;

    if (this.hasView(name)) {
      return this._views.get(name);
    }

    if (typeof view === 'string') {
      createView = viewTypes[view];
    }

    this.core.use(name, createView(this, { viewId: name }));

    this._views.set(name, this.core.api[name]);

    return this._views.get(name);
  }

  async serializeParty(partyKey = this.currentPartyKey) {
    const { mega } = this;

    // The `silent` option load the feeds but are not going to be detected by kappa.
    const partyFeeds = await mega.loadFeeds(this.getPartyName(partyKey, '**'), { silent: true });

    // We read the messages from all the party feeds
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

  async createPartyFromBuffer({ partyKey = crypto.randomBytes(32), buffer }) {
    const { mega } = this;

    const messages = JSON.parse(buffer);

    const feed = await mega.addFeed({ name: this.getPartyName(partyKey, 'local'), load: false, silent: true });

    await Promise.all(
      messages
        .filter(message => !message.type.includes('bind-profile'))
        .map(message => feed.pAppend(message))
    );

    await this.core.api.participants.bindControlProfile({ partyKey: Megafeed.keyToHex(partyKey) });

    await this.mega.setParty({
      rules: 'dsuite:documents',
      key: Megafeed.keyToBuffer(partyKey)
    });

    return partyKey;
  }
}

module.exports = DSuite;

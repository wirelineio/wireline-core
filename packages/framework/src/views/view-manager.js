//
// Copyright 2019 Wireline, Inc.
//

const { keyToHex } = require('@wirelineio/utils');

const { append } = require('../protocol/messages');

/**
 * Manages a collection of kappa views.
 */
class ViewManager {

  constructor(kappa, db, author) {
    console.assert(kappa);
    console.assert(db);
    console.assert(author);

    this._kappa = kappa;

    this._db = db;

    this._author = author;

    // Map of view types.
    this._types = new Map();

    // Map of views indexed by name.
    this._views = new Map();
  }

  setWriterFeed(feed) {
    this._feed = feed;
  }

  async append(data) {
    return append(this._feed, this._author, data);
  }

  isLocal(message) {
    return message.author === keyToHex(this._author);
  }

  registerTypes(types) {
    Object.keys(types).forEach(key => this._types.set(key, types[key]));
    return this;
  }

  registerViews(views) {
    views.forEach(view => this.registerView(view));
    return this;
  }

  hasView(name) {
    return this._views.has(name);
  }

  // TODO(burdon): Const for LogsView.
  // TODO(burdon): Disallow polymorphic viewType. Why pass in non-string?
  // TODO(burdon): Pass in arguments not objects.
  registerView({ name, view: viewType = 'LogsView' }) {
    // TODO(tinchoz49): Remove the try catch after merged mf2
    try {
      if (this._views.has(name)) {
        return this._views.get(name);
      }

      const viewConstructor = (typeof viewType === 'string') ? this._types.get(viewType) : viewType;
      if (!viewConstructor) {
        throw new Error(`Invalid view: ${name}:${viewType}`);
      }

      const view = viewConstructor(name, this._db, this._kappa, {
        append: this.append.bind(this),
        isLocal: this.isLocal.bind(this),
        author: this._author
      });

      this._kappa.use(name, view);
      this._views.set(name, view);

      return view;
    } catch (err) {
      console.warn(err.message);
      return null;
    }
  }
}

module.exports = ViewManager;

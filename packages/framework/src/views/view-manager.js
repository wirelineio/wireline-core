//
// Copyright 2019 Wireline, Inc.
//

/**
 * Manages a collection of kappa views.
 */
class ViewManager {

  constructor(kappa, db) {
    console.assert(kappa);
    console.assert(db);

    this._kappa = kappa;

    this._db = db;

    // Map of view types.
    this._types = new Map();

    // Map of views indexed by name.
    this._views = new Map();
  }

  setFeed(feed) {
    this._feed = feed;
  }

  getFeed() {
    return this._feed;
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
  registerView({ name, view: viewType = 'LogsView' }) {
    if (this._views.has(name)) {
      return this._views.get(name);
    }

    const viewConstructor = (typeof viewType === 'string') ? this._types.get(viewType) : viewType;
    console.assert(viewConstructor, `Invalid view: ${viewType}`);

    const view = viewConstructor(name, this._db, this._kappa, this.getFeed.bind(this));

    this._kappa.use(name, view);
    this._views.set(name, view);

    return view;
  }
}

module.exports = ViewManager;

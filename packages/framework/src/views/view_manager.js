//
// Copyright 2019 Wireline, Inc.
//

/**
 * Manages a collection of kappa views.
 */
class ViewManager {

  constructor(mega, kappa, db, partyManager) {
    console.assert(mega);
    console.assert(kappa);
    console.assert(db);
    console.assert(partyManager);

    this._kappa = kappa;

    // Adapter for views.
    // TODO(burdon): Remove partyManager dependency.
    this._adapter = { mega, core: kappa, db, partyManager };

    // Map of view types.
    this._types = new Map();

    // Map of views indexed by name.
    this._views = new Map();
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

    // TODO(burdon): Pass individual params.
    const view = viewConstructor(this._adapter, { viewId: name });

    this._kappa.use(name, view);
    this._views.set(name, view);

    return view;
  }
}

module.exports = ViewManager;

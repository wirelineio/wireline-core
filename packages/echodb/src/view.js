//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

/**
 * Wraps kappa view, provising synchronous access to logs.
 */
export class LogViewAdapter extends EventEmitter {

  static async createView(framework, itemId) {

    // User data is not differentiated by "type" (just partition).
    const viewName = 'data';

    // Creates a LogsView instance.
    framework.viewManager.registerView({ name: viewName });

    return new LogViewAdapter(framework.kappa.api[viewName], itemId);
  }

  /**
   * @param {LogsView} view - View wraps kappa view.
   * @param itemId - Data partition.
   */
  constructor(view, itemId) {
    super();
    console.assert(view);
    console.assert(itemId);

    this._view = view;
    this._itemId = itemId;

    this._log = [];
    this._view.onChange(itemId, (log) => {
      const { changes } = log;
      this._log = changes;

      this.emit('update', this._log);
    });
  }

  get log() {
    return this._log;
  }

  async getLog() {
    return this._view.getLogs(this._itemId);
  }

  async appendMutations(mutations) {
    for (const mutation of mutations) {
      await this._view.appendChange(this._itemId, mutation);
    }
  }
}

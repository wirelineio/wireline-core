//
// Copyright 2019 Wireline, Inc.
//

/**
 * Log view.
 * @returns {{api: {logs: (function(): Array)}, map: map}}
 * @constructor
 */
export const LogView = (type) => {
  let logsByType = [];

  return {
    map: (entries, next) => {
      entries.forEach(entry => {
        if (entry.value.type === type) {
          logsByType.push(entry.value);
        }
      });
      next();
    },

    api: {
      logs: () => {
        return logsByType;
      },

      logsByItemId: (core, itemId) => {
        // TODO(ashwin): View should create index.
        return logsByType.filter(item => item.itemId === itemId);
      }
    }
  }
};

/**
 * Log app.
 */
export class LogApp {

  constructor(view, itemId) {
    console.assert(view);
    console.assert(itemId);

    this._view = view;
    this._itemId = itemId;
  }

  list() {
    return this._view.logsByItemId(this._itemId).sort((a, b) => a.seq - b.seq);
  }
}

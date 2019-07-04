//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

/**
 * Log view.
 * @returns {{api: {logs: (function(): Array)}, map: map}}
 * @constructor
 */
export const LogView = (type) => {
  const events = new EventEmitter();

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

    indexed(entries) {
      entries.forEach(entry => {
        events.emit('update', entry.value.itemId);
      });
    },

    api: {
      logs: () => {
        return logsByType;
      },

      logsByItemId: (core, itemId) => {
        // TODO(ashwin): View should create index.
        return logsByType.filter(item => item.itemId === itemId);
      },

      events
    },
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

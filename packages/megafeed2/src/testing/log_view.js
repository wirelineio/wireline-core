//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

/**
 * Log view.
 * @param {string} type
 * @param {boolean} [usesCodec]
 * @returns {{api: {logs: (function(): Array)}, map: map}}
 * @constructor
 */
export const LogView = (type, usesCodec = false) => {
  const events = new EventEmitter();

  let logsByType = [];

  const getMessage = (item) => {
    // TODO(ashwin): Drop use of `usesCodec` once all tests move to using protocol buffers.
    return usesCodec ? item.message : item;
  };

  return {
    map: (entries, next) => {
      entries.forEach(entry => {
        // TODO(ashwin): Decide convention/format for `type`.
        const msgType = entry.value.type.split('.')[0];
        if (msgType === type) {
          logsByType.push(entry.value);
        }
      });
      next();
    },

    indexed(entries) {
      entries.forEach(entry => {
        events.emit('update', getMessage(entry.value).itemId);
      });
    },

    api: {
      logs: () => {
        return logsByType;
      },

      logsByItemId: (core, itemId) => {
        // TODO(ashwin): View should create index.
        return logsByType.filter(value => getMessage(value).itemId === itemId);
      },

      events
    },
  }
};

/**
 * Log app.
 */
export class LogApp {

  /**
   * @constructor
   * @param {Object} view
   * @param {String} itemId
   */
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

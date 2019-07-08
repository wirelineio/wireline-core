//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';

/**
 * Log view.
 * @param {string} type
 * @param {Codec} [codec]
 * @returns {{api: {logs: (function(): Array)}, map: map}}
 * @constructor
 */
export const LogView = (type, codec) => {
  const events = new EventEmitter();

  let logsByType = [];

  const getMessage = (item) => {
    return codec ? item.message : item;
  };

  return {
    map: (entries, next) => {
      entries.forEach(entry => {
        const value = codec ? codec.decodeWithType(entry.value): entry.value;
        const msgType = codec ? value.type.split('.')[0] : value.type;
        if (msgType === type) {
          logsByType.push(value);
        }
      });
      next();
    },

    indexed(entries) {
      entries.forEach(entry => {
        const value = codec ? codec.decodeWithType(entry.value): entry.value;
        events.emit('update', getMessage(value).itemId);
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

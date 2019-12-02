//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { PartyMessageTypes } from './partyMessageTypes';

const log = debug('creds:party:kappa');

export class PartyKappaAdapter {
  constructor(view, partyConstruction) {
    console.assert(view);
    console.assert(partyConstruction);

    this._view = view;
    this._partyConstruction = partyConstruction;
    this._queue = [];

    this._draining = false;
  }

  start() {
    // Process exactly one genesis message.
    this._view.events.once(PartyMessageTypes.GENESIS, this._enqueue.bind(this));

    // Process N messages of other types.
    Object.getOwnPropertyNames(PartyMessageTypes).forEach((type) => {
      if (PartyMessageTypes[type] !== PartyMessageTypes.GENESIS) {
        this._view.events.on(PartyMessageTypes[type], this._enqueue.bind(this));
      }
    });
  }

  _enqueue(msg) {
    this._queue.push(msg);
    setImmediate(this._drain.bind(this));
  }

  async _drain() {
    if (this._draining) {
      return;
    }

    this._draining = true;
    while (this._queue.length) {
      try {
        await this._partyConstruction.processMessage(this._queue.shift());
      } catch (err) {
        log(err);
      }
    }
    this._draining = false;
  }
}

//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { AuthMessageTypes } from './authentication';

const log = debug('creds:authentication:kappa');

export class AuthKappaAdapter {
  constructor(view, auth) {
    console.assert(view);
    console.assert(auth);

    this._view = view;
    this._auth = auth;
    this._queue = [];

    this._draining = false;
  }

  start() {
    // Process exactly one genesis message.
    this._view.events.once(AuthMessageTypes.GENESIS, this._enqueue.bind(this));

    // Process N messages of other types.
    Object.getOwnPropertyNames(AuthMessageTypes).forEach((type) => {
      if (AuthMessageTypes[type] !== AuthMessageTypes.GENESIS) {
        this._view.events.on(AuthMessageTypes[type], this._enqueue.bind(this));
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
        await this._auth.processMessage(this._queue.shift());
      } catch (err) {
        log(err);
      }
    }
    this._draining = false;
  }
}

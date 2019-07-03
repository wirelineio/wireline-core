//
// Copyright 2019 Wireline, Inc.
//

import pify from 'pify';

/**
 * Stores protocol buffer messages.
 */
export class MessageStore {

  /**
   * @constructor
   * @param {HyperTrie} db
   * @param {object} codec
   */
  constructor(db, codec) {
    console.assert(db);
    console.assert(codec);

    this._db = {
      key: () => db.key,
      ready: pify(db.ready.bind(db)),
      put: pify(db.put.bind(db)),
      get: pify(db.get.bind(db)),
      delete: pify(db.del.bind(db)),
      list: pify(db.list.bind(db)),
    };

    this._codec = codec;
  }

  get key() {
    return this._db.key();
  }

  async ready() {
    await this._db.ready();
    return this;
  }

  async keys(path) {
    // TODO(ashwin): { recursive: false } doesn't seem to work?
    const list = await this._db.list(`${path}`, { recursive: false });
    return list.map(({ key }) => key);
  }

  async list(path) {
    const list = await this._db.list(`${path}/`);
    return list.map(({ value }) => this._codec.decode(value));
  }

  async get(key) {
    const item = await this._db.get(key);
    return item && this._codec.decode(item.value);
  }

  async put(key, value) {
    return this._db.put(key, this._codec.encode(value));
  }

  async delete(key) {
    return this._db.delete(key);
  }
}

//
// Copyright 2019 Wireline, Inc.
//

const pify = require('pify');

const { keyToHex } = require('./keys');

/**
 * Repository
 *
 * Class to persist a collection of items by the same namespace.
 */
class Repository {

  /**
   * constructor
   *
   * @param {Hypertrie} options.db Hypertrie DB to persist the data.
   * @param {String} options.namespace Key to group the data.
   */
  constructor(db, namespace, codec) {
    this._namespace = namespace;

    this._codec = codec;

    this._dbReady = pify(db.ready.bind(db));
    this._dbPut = pify(db.put.bind(db));
    this._dbGet = pify(db.get.bind(db));
    this._dbDelete = pify(db.del.bind(db));
    this._dbList = pify(db.list.bind(db));
  }

  async ready() {
    return this._dbReady();
  }

  async list() {
    const list = await this._dbList(`${this._namespace}/`);
    return list.map(({ value }) => this._codec.decode(value));
  }

  async get(key) {
    return this._dbGet(`${this._namespace}/${keyToHex(key)}`, { valueEncoding: this._codec });
  }

  async put(key, value) {
    return this._dbPut(`${this._namespace}/${keyToHex(key)}`, this._codec.encode(value));
  }

  async delete(key) {
    return this._dbDelete(`${this._namespace}/${keyToHex(key)}`);
  }
}

module.exports = Repository;

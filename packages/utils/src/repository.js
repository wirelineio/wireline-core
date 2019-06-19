//
// Copyright 2019 Wireline, Inc.
//

const { promisify } = require('util');

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
  constructor(options = {}) {
    const { db, namespace } = options;

    this._namespace = namespace;

    this._dbReady = promisify(db.ready.bind(db));
    this._dbPut = promisify(db.put.bind(db));
    this._dbGet = promisify(db.get.bind(db));
    this._dbDelete = promisify(db.del.bind(db));
    this._dbList = promisify(db.list.bind(db));
  }

  async ready() {
    return this._dbReady();
  }

  async getList({ codec }) {
    const list = await this._dbList(`${this._namespace}/`);
    return list.map(({ value }) => codec.decode(value));
  }

  async get(key, { codec }) {
    return this._dbGet(`${this._namespace}/${keyToHex(key)}`, { valueEncoding: codec });
  }

  async put(key, value, { encode }) {
    return this._dbPut(`${this._namespace}/${keyToHex(key)}`, encode(value));
  }

  async delete(key) {
    return this._dbDelete(`${this._namespace}/${keyToHex(key)}`);
  }
}

module.exports = Repository;

const { EventEmitter } = require('events');
const path = require('path');

const hypercore = require('hypercore');
const raf = require('random-access-file');
const pify = require('pify');

const { keyToHex } = require('@wirelineio/utils');

class FeedDescriptor extends EventEmitter {
  constructor(stat, storage) {
    super();

    const { path, key, secretKey, valueEncoding, metadata, load } = stat;

    this._stat = {
      path: path || keyToHex(key),
      key,
      secretKey,
      valueEncoding,
      metadata,
      load: load || false
    };

    this._storage = storage;

    this._announced = false;
  }

  get stat() {
    return this._stat;
  }

  get feed() {
    return this._feed;
  }

  get opened() {
    return this.feed && this._feed.opened;
  }

  create() {
    this._feed = hypercore(this._createStorage(), this._stat.key, {
      secretKey: this._stat.secretKey,
      valueEncoding: this._stat.valueEncoding
    });

    this._feed.ready(() => {
      this.emit('ready');
    });
  }

  async ready() {
    if (this.opened) {
      return;
    }

    return new Promise((resolve) => {
      this.on('ready', resolve);
    });
  }

  async close() {
    if (this.open) {
      return pify(this._feed.close.bind(this._feed))();
    }
  }

  _createStorage(dir, customStorage) {
    const ras = customStorage || this._defaultStorage;

    return (name) => {
      if (typeof ras === 'string') {
        return raf(path.join(ras, dir, name));
      }
      return ras(`${dir}/${name}`);
    };
  }
}

module.exports = FeedDescriptor;

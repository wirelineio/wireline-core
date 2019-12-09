//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { feedKey } from '@wirelineio/mixer';
import { keyToHex } from '@wirelineio/utils';

import { partyCodec } from './codec';
import { Keyring } from '../crypto';

const log = debug('creds:party:mixer');

const BUCKET = 'party';

export class PartyMixerAdapter {
  constructor(party) {
    console.assert(party);

    this._party = party;
    this._queue = [];

    this._stream = null;
    this._draining = false;
    this._keyring = new Keyring();
  }

  start() {
    if (this._stream) {
      log('Already started!');
      return;
    }

    this._stream = this._party.mixer.createKeyStream(feedKey('.*', keyToHex(this._party.publicKey)), { bucketId: BUCKET });
    this._stream.on('data', this._enqueue.bind(this));
    this._stream.on('close', () => {
      log('Stream closed.');
      this._stream = null;
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
        const message = this._queue.shift();
        if (message.data && !Buffer.isBuffer(message.data)) {
          message.data = Buffer.from(message.data);
        }
        message.data = partyCodec.decode(message.data);
        await this._party.processMessage(message);
      } catch (err) {
        log(err);
      }
    }
    this._draining = false;
  }
}

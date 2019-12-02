//
// Copyright 2019 Wireline, Inc.
//

const { Keyring, PartyMessageTypes, partyCodec } = require('@wirelineio/credentials');

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { uuid } = require('../utils/uuid');

module.exports = function PartyView(viewId, db, core, { append, isLocal }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, 'party', { valueEncoding: 'json' });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (value.bucketId !== 'party' && !value.type.startsWith('party.')) {
        return [];
      }

      const { type } = value;

      switch (type) {
        case 'party.genesis':
          // This needs validated, but while there will be a Genesis message in every feed, it will always be identical.
          return [[uuid('genesis'), value]];
        case 'party.admit.key':
          return [[uuid('admit.party', value.id), value]];
        case 'party.admit.feed':
          return [[uuid('admit.feed', value.id), value]];
        case 'party.envelope':
          return [[uuid('envelope', value.id), value]];
        default:
          return [];
      }
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith('party.'))
        .forEach(({ value }) => {
          if (value.data && !Buffer.isBuffer(value.data)) {
            value.data = Buffer.from(value.data);
          }
          value.data = partyCodec.decode(value.data);
          events.emit(value.type, value, isLocal(value));
        });
    },

    api: {
      async signAndWrite(core, data, keys) {
        const keyring = new Keyring();

        switch (data.type) {
          case PartyMessageTypes.GENESIS:
            data.__type_url = '.dxos.party.PartyGenesis';
            break;
          case PartyMessageTypes.ADMIT_KEY:
            data.__type_url = '.dxos.party.KeyAdmit';
            break;
          case PartyMessageTypes.ADMIT_FEED:
            data.__type_url = '.dxos.party.FeedAdmit';
            break;
          case PartyMessageTypes.ENVELOPE:
            data.__type_url = '.dxos.party.Envelope';
            break;
          default:
            throw new Error(`Bad message type: ${data.type}`);
        }

        const signed = {
          bucketId: 'party',
          __type_url: '.dxos.party.SignedMessage',
          ...await keyring.sign(data, keys)
        };

        return core.api[viewId].write(signed);
      },

      async write(core, data) {
        // All of our data should be signed.
        const keyring = new Keyring();

        const { signed, signatures } = data;
        if (!signed || !signatures || !Array.isArray(signatures)) {
          throw new Error(`Bad message: ${JSON.stringify(data)}`);
        }

        const verified = await keyring.verify(data);
        if (!verified) {
          throw new Error(`Unverifiable message: ${JSON.stringify(data)}`);
        }

        const { type } = signed;
        if (!type) {
          throw new Error(`Bad message type: ${type}`);
        }

        const encoded = partyCodec.encode(data);

        const msg = await append({
          type,
          data: encoded
        });

        msg.data = partyCodec.decode(msg.data);
        msg.data.__type_url = data.__type_url;

        return msg;
      },

      events
    }
  });
};

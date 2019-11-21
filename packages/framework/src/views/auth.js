//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { uuid } = require('../utils/uuid');

module.exports = function AuthView(viewId, db, core, { append, isLocal }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, 'party', { valueEncoding: 'json' });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith('party.')) {
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
        default:
          return [];
      }
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith('party.'))
        // We should have causal ordering, not self-reported timestamps.
        .sort((a, b) => a.value.timestamp - b.value.timestamp)
        .forEach(({ value }) => {
          events.emit(value.type, value, isLocal(value));
        });
    },

    api: {
      async write(core, { data }) {
        const { type } = data;
        if (!type) {
          throw new Error('type must be specified!');
        }

        const msg = await append({
          type,
          data
        });

        events.emit(type, msg, true);
        return msg;
      },

      events
    }
  });
};

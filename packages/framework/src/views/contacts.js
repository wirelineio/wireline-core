//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');
const pify = require('pify');

const { keyToHex } = require('@wirelineio/utils');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');

module.exports = function ContactsView(viewId, db, core, { append, isLocal, author }) {
  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const viewDB = sub(db, 'contacts', { valueEncoding: 'json' });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith('contact.')) {
        return [];
      }

      const type = value.type.replace('contact.', '');
      switch (type) {
        case 'set-profile':
          return [[uuid('profile', value.author), value]];

        default:
          return [];
      }
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith('contact.'))
        .sort((a, b) => a.value.timestamp - b.value.timestamp)
        .forEach(({ value }) => {
          const event = value.type.replace('contact.', '');

          if (event === 'set-profile') {
            events.emit(event, value);

            if (!isLocal(value)) {
              events.emit('contact', value);
            }
          }
        });
    },

    // TODO(burdon): Standardize method names.

    api: {

      async getContacts(core, opts = {}) {
        await pify(this.ready.bind(this))();

        const fromKey = uuid('profile');
        const toKey = `${fromKey}~`;
        const reader = viewDB.createValueStream({ gte: fromKey, lte: toKey, reverse: opts.reverse });
        return streamToList(reader, (msg, next) => {
          if (!opts.all && isLocal(msg)) {
            return next(false);
          }

          return next(true);
        });
      },

      async getProfile(core, { key } = {}) {
        await pify(this.ready.bind(this))();

        try {
          return await viewDB.get(uuid('profile', key || keyToHex(author)));
        } catch (error) {
          if (error.notFound) {
            return;
          }

          throw error;
        }
      },

      async setProfile(core, { data }) {
        await append({
          type: 'contact.set-profile',
          data
        });

        return { data };
      },

      events
    }
  });
};

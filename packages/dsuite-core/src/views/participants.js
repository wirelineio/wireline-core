//
// Copyright 2019 Wireline, Inc.
//

const EventEmitter = require('events');
const view = require('kappa-view-level');
const sub = require('subleveldown');

const { streamToList } = require('../utils/stream');
const { uuid } = require('../utils/uuid');
const { append } = require('../protocol/messages');

module.exports = function ParticipantsView(dsuite) {
  const { db } = dsuite;

  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  let currentPartyKey;
  dsuite.on('party-changed', ({ partyKey: newPartyKey }) => {
    currentPartyKey = newPartyKey.toString('hex');
  });

  const viewDB = sub(db, 'participants', { valueEncoding: 'json' });

  return view(viewDB, {
    map(msg) {
      const { value } = msg;
      if (!value.type.startsWith('participant.')) {
        return [];
      }

      const partyKey = dsuite.getPartyKeyFromFeedKey(msg.key);
      value.partyKey = partyKey;

      const type = value.type.replace('participant.', '');
      switch (type) {
        case 'bind-profile':
          return [[uuid('participant', partyKey, value.author), value]];

        default:
          return [];
      }
    },

    indexed(msgs) {
      msgs
        .filter(msg => msg.value.type.startsWith('participant.'))
        .sort((a, b) => a.value.timestamp - b.value.timestamp)
        .forEach(({ value }) => {
          const event = value.type.replace('participant.', '');

          if (event === 'bind-profile') {
            events.emit(event, value);

            if (!dsuite.core.api['participants'].isMyProfile(value.author, value.partyKey)) {
              events.emit('participant', value);
            }
          }
        });
    },

    // TODO(burdon): Standardize method names.

    api: {

      // TODO(burdon): Comment.
      key() {
        return dsuite.mega.key.toString('hex');
      },

      async bindControlProfile(core, opts = {}) {
        const partyKey = opts.partyKey || currentPartyKey;
        const feed = dsuite.getLocalPartyFeed(partyKey);
        const controlKey = dsuite.mega.feed('control').key.toString('hex');

        const profile = await core.api['participants'].getProfile({ partyKey });

        if (profile) {
          return;
        }

        return append(feed, {
          type: 'participant.bind-profile',
          data: {
            controlKey
          }
        });
      },

      getParticipants(core, opts = {}) {
        const partyKey = opts.partyKey || currentPartyKey;

        const fromKey = uuid('participant', partyKey);
        const toKey = `${fromKey}~`;

        const reader = viewDB.createValueStream({ gte: fromKey, lte: toKey, reverse: opts.reverse });

        return streamToList(reader, (msg, next) => {
          if (core.api['participants'].isMyProfile(msg.author, msg.partyKey)) {
            return next(false);
          }

          return next(true);
        });
      },

      async getContacts(core, opts = {}) {
        const participants = await core.api['participants'].getParticipants(opts);
        return Promise.all(participants.map(
          participant => core.api['contacts'].getProfile({ key: participant.data.controlKey })
        ));
      },

      async getProfile(core, opts = {}) {
        try {
          const partyKey = opts.partyKey || currentPartyKey;
          const key = opts.key || dsuite.getLocalPartyFeed(partyKey).key.toString('hex');
          const participant = await viewDB.get(uuid('participant', partyKey, key));
          return core.api['contacts'].getProfile({ key: participant.data.controlKey });
        } catch (error) {
          if (error.notFound) {
            return;
          }

          throw error;
        }
      },

      // Redirect to the contact setProfile.
      async setProfile(core, opts) {
        return core.api['contacts'].setProfile(opts);
      },

      isMyProfile(core, key, partyKey) {
        const feed = dsuite.getLocalPartyFeed(partyKey || currentPartyKey);
        return feed && key === feed.key.toString('hex');
      },

      events
    }
  });
};

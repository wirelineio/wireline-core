//
// Copyright 2019 Wireline, Inc.
//

const { Megafeed } = require('@wirelineio/megafeed');

// TODO(burdon): Remove dsuite dependency.
module.exports = (dsuite) => {
  const { conf } = dsuite;

  return {
    name: 'dsuite:bot',

    replicateOptions: {
      live: true
    },

    async handshake({ peer }) {
      // The bot does nothing here, just wait for invitations through remoteUpdateFeeds.
      if (conf.isBot) {
        return;
      }

      // If the peer is a user it sends a message with the partyKey.
      peer.sendEphemeralMessage({
        type: 'invite-to-party',
        value: dsuite.currentPartyKey
      });
    },

    async onEphemeralMessage({ message: { type, value }, peer }) {
      if (conf.isBot) {
        if (type === 'invite-to-party') {
          await dsuite.connectToParty({ key: value });

          peer.sendEphemeralMessage({
            type: 'close',
            value: ''
          });
        }
      } else if (type === 'close') {
        // TODO(burdon): Move to util.
        dsuite.swarm.leave(Megafeed.discoveryKey(peer.partyKey));
      }
    }
  };
};

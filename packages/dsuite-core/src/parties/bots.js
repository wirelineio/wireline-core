//
// Copyright 2019 Wireline, Inc.
//

const { getDiscoveryKey } = require('@wirelineio/utils');

module.exports = ({ conf, swarm, partyManager }) => {
  return {
    name: 'dsuite:bot',

    replicateOptions: {
      live: true
    },

    async handshake({ peer }) {
      partyManager.emit('rule-handshake', { rule: this, peer });

      // The bot does nothing here, just wait for invitations through remoteUpdateFeeds.
      if (conf.isBot) {
        return;
      }

      // If the peer is a user it sends a message with the partyKey.
      peer.sendEphemeralMessage({
        type: 'invite-to-party',
        value: partyManager.currentPartyKey
      });
    },

    async onEphemeralMessage({ message, peer }) {
      partyManager.emit('rule-ephemeral-message', { rule: this, message, peer });

      const { type, value } = message;

      if (conf.isBot) {
        if (type === 'invite-to-party') {
          await partyManager.connectToParty({ key: value });

          peer.sendEphemeralMessage({
            type: 'close',
            value: ''
          });
        }
      } else if (type === 'close') {
        swarm.leave(getDiscoveryKey(peer.partyKey));
      }
    }
  };
};

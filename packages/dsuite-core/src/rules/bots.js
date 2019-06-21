//
// Copyright 2019 Wireline, Inc.
//

const { getDiscoveryKey } = require('@wirelineio/utils');

// TODO(burdon): Remove dsuite dependency.
module.exports = dsuite => (
  {
    name: 'dsuite:bot',

    replicateOptions: {
      live: true
    },

    async handshake({ peer }) {
      dsuite.emit(`rule:${this.name}:handshake`, { rule: this, peer });

      // The bot does nothing here, just wait for invitations through remoteUpdateFeeds.
      if (dsuite.conf.isBot) {
        return;
      }

      // If the peer is a user it sends a message with the partyKey.
      peer.sendEphemeralMessage({
        type: 'invite-to-party',
        value: dsuite.currentPartyKey
      });
    },

    async onEphemeralMessage({ message, peer }) {
      dsuite.emit(`rule:${this.name}:message`, { rule: this, message, peer });

      const { type, value } = message;

      if (dsuite.conf.isBot) {
        if (type === 'invite-to-party') {
          await dsuite.connectToParty({ key: value });

          peer.sendEphemeralMessage({
            type: 'close',
            value: ''
          });
        }
      } else if (type === 'close') {
        dsuite.swarm.leave(getDiscoveryKey(peer.partyKey));
      }
    }
  }
);

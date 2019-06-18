//
// Copyright 2019 Wireline, Inc.
//

const { getDiscoveryKey } = require('@wirelineio/utils');

/**
 * setPartyRules
 * @param dsuite {DSuite}
 */
module.exports = function setRules(dsuite) {
  const { mega, conf } = dsuite;

  mega.setRules({
    name: 'dsuite:bot',

    replicateOptions: {
      live: true
    },

    async handshake({ peer }) {
      if (conf.isBot) {

        // The bot does nothing here, just wait for invitations through remoteUpdateFeeds.
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
        dsuite.swarm.leave(getDiscoveryKey(peer.partyKey));
      }
    }
  });
};

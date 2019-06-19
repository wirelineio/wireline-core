//
// Copyright 2019 Wireline, Inc.
//

const { Megafeed } = require('@wirelineio/megafeed');

/**
 * setPartyRules
 * @param dsuite {DSuite}
 */
// TODO(burdon): Rename dsuite.
module.exports = function setRules(dsuite) {
  const { mega, conf } = dsuite;

  mega.setRules({
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
        dsuite.swarm.leave(Megafeed.discoveryKey(peer.partyKey));
      }
    }
  });
};

//
// Copyright 2019 Wireline, Inc.
//

const { Megafeed } = require('@wirelineio/megafeed');

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
      peer.sendMessage({
        subject: 'invite-to-party',
        data: dsuite.currentPartyKey
      });
    },

    async remoteMessage({ message, peer }) {
      if (conf.isBot) {
        if (message.subject === 'invite-to-party') {
          await dsuite.connectToParty({ key: message.data });

          peer.sendMessage({
            subject: 'close',
            data: ''
          });
        }
      } else if (message.subject === 'close') {
        dsuite.swarm.leave(Megafeed.discoveryKey(peer.partyKey));
      }
    }
  });
};

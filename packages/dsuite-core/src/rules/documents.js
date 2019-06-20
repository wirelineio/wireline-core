//
// Copyright 2019 Wireline, Inc.
//

const { encodeFeedKey, decodeFeedKey } = require('../protocol/feeds');

// TODO(burdon): Remove dsuite dependency.
module.exports = function setRules(dsuite) {
  const { core, mega } = dsuite;

  return {
    name: 'dsuite:documents',

    replicateOptions: {
      live: true,
      timeout: 0
    },

    async getParticipantKeys(partyKey) {
      const participants = await dsuite.api['participants'].getParticipants({ partyKey });

      return participants.reduce((prev, participant) => (
        [
          ...prev,
          encodeFeedKey('control-feed', participant.data.controlKey),
          encodeFeedKey('party-feed', participant.author)
        ]),
      []);
    },

    async handshake({ peer }) {
      dsuite.emit(`rule:${this.name}:handshake`, { rule: this, peer });

      const partyKey = peer.party.key.toString('hex');
      const controlFeed = mega.feed('control');
      const feed = await dsuite.getLocalPartyFeed(partyKey);

      const participantKeys = await this.getParticipantKeys(partyKey);

      const keys = [
        encodeFeedKey('control-feed', controlFeed.key),
        encodeFeedKey('party-feed', feed.key),
        ...participantKeys
      ];

      // Send the keys that I have to share and the remote peer returns the keys that really want to replicate.
      await peer.introduceFeeds({ keys });

      keys.forEach((feedKey) => {
        const { key } = decodeFeedKey(feedKey);
        const feed = mega.feed(key);
        peer.replicate(feed);
      });

      const onParticipant = async (msg) => {
        if (msg.partyKey !== partyKey) {
          return;
        }

        const keys = [
          encodeFeedKey('control-feed', msg.data.controlKey),
          encodeFeedKey('party-feed', msg.author)
        ];

        await peer.introduceFeeds({ keys });

        keys.forEach((feedKey) => {
          const { key } = decodeFeedKey(feedKey);
          const feed = mega.feed(key);
          peer.replicate(feed);
        });
      };

      core.api['participants'].events.on('participant', onParticipant);
      peer.on('destroy', () => {
        core.api['participants'].events.removeListener('participant', onParticipant);
      });
    },

    async onEphemeralMessage({ message, peer }) {
      dsuite.emit(`rule:${this.name}:message`, { rule: this, message, peer });
    },

    async onIntroduceFeeds({ message, peer }) {
      const partyKey = peer.party.key.toString('hex');
      const { keys } = message;

      await Promise.all(keys.map(async (feedKey) => {
        const { type, key } = decodeFeedKey(feedKey);

        let name;
        if (type === 'party-feed') {
          name = dsuite.getPartyName(partyKey, key);
        } else {
          name = `control-feed/${key.toString('hex')}`;
        }

        return mega.addFeed({ name, key, load: false });
      }));

      // The keys I allow to replicate.
      return { keys };
    }
  };
};

const pump = require('pump');
const crypto = require('crypto');

const Party = require('./party');

test('party handshake', (done) => {
  expect.assertions(9);

  const partyKey = crypto.randomBytes(32);

  const peerOne = new Party({
    key: partyKey,
    rules: {
      findFeed() {},
      handshake: async ({ peer }) => {
        const { keys } = await peer.introduceFeeds({ keys: [Buffer.from('akey')] });
        expect(keys).toEqual([Buffer.from('akey2')]);

        const answer = await peer.request({ type: 'question', value: Buffer.from('who are you?') });

        expect(answer.type).toBe('answer');
        expect(answer.value).toEqual(Buffer.from('i`m batman'));

        peer.sendEphemeralMessage({ type: 'ephemeral', value: Buffer.from('ephemeral') });
      },
    }
  });

  const peerTwo = new Party({
    key: partyKey,
    rules: {
      findFeed() {},
      handshake: () => {},
      onIntroduceFeeds: async ({ message }) => {
        expect(message.keys).toEqual([Buffer.from('akey')]);
        return { keys: [Buffer.from('akey2')] };
      },
      onRequest: async ({ message }) => {
        expect(message.type).toBe('question');
        expect(message.value).toEqual(Buffer.from('who are you?'));
        return { type: 'answer', value: Buffer.from('i`m batman') };
      },
      onEphemeralMessage: async ({ message }) => {
        expect(message.type).toBe('ephemeral');
        expect(message.value).toEqual(Buffer.from('ephemeral'));
        done();
      }
    }
  });

  const r1 = peerOne.replicate({ expectedFeeds: 1 });
  const r2 = peerTwo.replicate({ expectedFeeds: 1 });

  r1.on('party-handshake', (peer) => {
    expect(peer.party).toBe(peerOne);
  });

  pump(r1, r2, r1, () => {});
});

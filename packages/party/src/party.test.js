//
// Copyright 2019 Wireline, Inc.
//

const crypto = require('crypto');
const pump = require('pump');

const Party = require('./party');

test('party handshake', (done) => {
  expect.assertions(9);

  // Discovery key.
  const partyKey = crypto.randomBytes(32);

  const party1 = new Party({
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

  const party2 = new Party({
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

  const r1 = party1.replicate({ expectedFeeds: 1 });
  const r2 = party2.replicate({ expectedFeeds: 1 });

  r1.on('party-handshake', (peer) => {
    expect(peer.party).toBe(party1);
  });

  pump(r1, r2, r1);
});

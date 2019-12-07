//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { PartyMessageTypes, signPartyMessage as _signPartyMessage } from './partyMessage';
import { Keyring, KeyTypes } from '../crypto';
import { Party } from './party';
import { partyCodec } from './codec';

const log = debug('creds:party:test');

jest.setTimeout(60000);

const mockKeyring = async () => {
  const keyring = new Keyring();
  for await (const type of Object.getOwnPropertyNames(KeyTypes)) {
    await keyring.generate({ type });
  }
  return keyring;
};

// Create our own version of this that loops everything through the codec
// so that we can test our protobufs fully.
const signPartyMessage = async (message, keys) => {
  const signed = await _signPartyMessage(message, keys);
  const encoded = partyCodec.encode(signed);
  return partyCodec.decode(encoded);
};

test('Process Basic Message Types', async (done) => {
  const keyring = await mockKeyring();
  const party = new Party(keyring.party.publicKey);

  const extraFeed = await keyring.generate({ type: KeyTypes.FEED });

  const messages = [
    // The Genesis message is signed by the party private key, the feed key, and one admitted key.
    await signPartyMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    // A user (represented by the pseudonym key) will also need a device.
    await signPartyMessage({
      type: PartyMessageTypes.ADMIT_KEY,
      party: keyring.party.publicKey,
      admit: keyring.devicePseudonym.publicKey,
    }, [keyring.pseudonym, keyring.devicePseudonym]),
    // We don't actually need this feed, since the initial feed is in the Genesis message, but we want to test all types.
    await signPartyMessage({
      type: PartyMessageTypes.ADMIT_FEED,
      party: keyring.party.publicKey,
      feed: extraFeed.publicKey,
    }, [keyring.devicePseudonym, extraFeed])
  ];

  for await (const message of messages) {
    await party.processMessage(message);
  }

  expect(party._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(party._keyring.get(keyring.devicePseudonym).key).toEqual(keyring.devicePseudonym.key);
  expect(party._keyring.findOne({ key: keyring.feed.key, type: KeyTypes.FEED }).key).toContain(keyring.feed.key);
  expect(party._keyring.findOne({ key: extraFeed.key, type: KeyTypes.FEED }).key).toContain(extraFeed.key);

  done();
});

test('Reject Message from Unknown Source', async (done) => {
  const keyring = await mockKeyring();
  const party = new Party(keyring.party.publicKey);

  const unknownKey = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signPartyMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    await signPartyMessage({
      type: PartyMessageTypes.ADMIT_KEY,
      party: keyring.party.publicKey,
      admit: keyring.devicePseudonym.publicKey
    }, [unknownKey, keyring.devicePseudonym]),
  ];

  let hadError = false;

  for await (const message of messages) {
    try {
      await party.processMessage(message);
    } catch (e) {
      hadError = true;
    }
  }

  expect(hadError).toBeTruthy();
  expect(party._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(party._keyring.get(keyring.devicePseudonym)).toBeNull();

  done();
});

test('Greeter Envelopes', async (done) => {
  const keyring = await mockKeyring();
  const party = new Party(keyring.party.publicKey);

  const genesis = await signPartyMessage({
    type: PartyMessageTypes.GENESIS,
    party: keyring.party.publicKey,
    admit: keyring.pseudonym.publicKey,
    feed: keyring.feed.publicKey,
  }, [keyring.party, keyring.pseudonym, keyring.feed]);

  await party.processMessage(genesis);

  expect(party._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);

  const secondKeyring = await mockKeyring();

  const pseudo = await signPartyMessage({
    type: PartyMessageTypes.ADMIT_KEY,
    party: keyring.party.publicKey,
    admit: secondKeyring.pseudonym.publicKey,
  }, [secondKeyring.pseudonym]);

  const envelope = await signPartyMessage({
    type: PartyMessageTypes.ENVELOPE,
    contents: {
      ...pseudo,
      __type_url: '.dxos.party.SignedMessage'
    }
  }, [keyring.pseudonym]);

  await party.processMessage(envelope);

  expect(party._keyring.get(secondKeyring.pseudonym).key).toEqual(secondKeyring.pseudonym.key);

  done();
});

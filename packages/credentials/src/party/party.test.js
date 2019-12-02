//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { partyCodec } from './codec';
import { PartyMessageTypes } from './partyMessageTypes';
import { Keyring, KeyTypes } from '../crypto';
import { Party } from './party';

const log = debug('creds:party:test');

jest.setTimeout(60000);

// This is analogous to the signAndWrite method on the kappa view.
const signMessage = async (payload, keys) => {
  const keyring = new Keyring();

  switch (payload.type) {
    case PartyMessageTypes.GENESIS:
      payload.__type_url = '.dxos.party.PartyGenesis';
      break;
    case PartyMessageTypes.ADMIT_KEY:
      payload.__type_url = '.dxos.party.KeyAdmit';
      break;
    case PartyMessageTypes.ADMIT_FEED:
      payload.__type_url = '.dxos.party.FeedAdmit';
      break;
    case PartyMessageTypes.ENVELOPE:
      payload.__type_url = '.dxos.party.Envelope';
      break;
    default:
      log('Unknown type:', payload.type);
  }

  const signed = {
    bucketId: 'party',
    ...await keyring.sign(payload, keys)
  };

  // Loop it through the codec to make sure every message we use is valid to the protobuf def.
  const encoded = partyCodec.encode(signed);
  return partyCodec.decode(encoded);
};

const mockKeyring = async () => {
  const keyring = new Keyring();
  for await (const type of Object.getOwnPropertyNames(KeyTypes)) {
    await keyring.generate({ type });
  }
  return keyring;
};

test('Process Basic Message Types', async (done) => {
  const keyring = await mockKeyring();
  const party = new Party(keyring.party.publicKey);

  const extraFeed = await keyring.generate({ type: KeyTypes.FEED });

  const messages = [
    // The Genesis message is signed by the party private key and one admitted key.
    await signMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    // A user (represented by the pseudonym key) will also need a device.
    await signMessage({
      type: PartyMessageTypes.ADMIT_KEY,
      party: keyring.party.publicKey,
      admit: keyring.devicePseudonym.publicKey,
    }, [keyring.pseudonym, keyring.devicePseudonym]),
    // We don't actually need this feed, since the initial feed is in the Genesis message, but we want to test all types.
    await signMessage({
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
    await signMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    await signMessage({
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

  const genesis = await signMessage({
    type: PartyMessageTypes.GENESIS,
    party: keyring.party.publicKey,
    admit: keyring.pseudonym.publicKey,
    feed: keyring.feed.publicKey,
  }, [keyring.party, keyring.pseudonym, keyring.feed]);

  await party.processMessage(genesis);

  expect(party._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);

  const secondKeyring = await mockKeyring();

  const pseudo = await signMessage({
    type: PartyMessageTypes.ADMIT_KEY,
    party: keyring.party.publicKey,
    admit: secondKeyring.pseudonym.publicKey,
  }, [secondKeyring.pseudonym]);

  const envelope = await signMessage({
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

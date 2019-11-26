//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Authentication, AuthMessageTypes, } from './authentication';
import { partyCodec } from './codec';
import { Keyring, KeyTypes } from '../crypto';

const log = debug('creds:authentication:test');

jest.setTimeout(60000);

const signMessage = async (payload, keys) => {
  const keyring = new Keyring();

  switch (payload.type) {
    case AuthMessageTypes.GENESIS:
      payload.__type_url = '.dxos.party.PartyGenesis';
      break;
    case AuthMessageTypes.ADMIT_KEY:
      payload.__type_url = '.dxos.party.KeyAdmit';
      break;
    case AuthMessageTypes.ADMIT_FEED:
      payload.__type_url = '.dxos.party.FeedAdmit';
      break;
    case AuthMessageTypes.ENVELOPE:
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
  const auth = await new Authentication().init();

  const extraFeed = await keyring.generate({ type: KeyTypes.FEED });

  const messages = [
    // The Genesis message is signed by the party private key and one admitted key.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    // A user (represented by the pseudonym key) will also need a device.
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: keyring.party.publicKey,
      admit: keyring.devicePseudonym.publicKey,
    }, [keyring.pseudonym, keyring.devicePseudonym]),
    // We don't actually need this feed, since the initial feed is in the Genesis message, but we want to test all types.
    await signMessage({
      type: AuthMessageTypes.ADMIT_FEED,
      party: keyring.party.publicKey,
      feed: extraFeed.publicKey,
    }, [keyring.devicePseudonym, extraFeed])
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(auth._keyring.get(keyring.devicePseudonym).key).toEqual(keyring.devicePseudonym.key);
  expect(auth._keyring.findOne({ key: keyring.feed.key, type: KeyTypes.FEED }).key).toContain(keyring.feed.key);
  expect(auth._keyring.findOne({ key: extraFeed.key, type: KeyTypes.FEED }).key).toContain(extraFeed.key);

  done();
});

test('Reject Message from Unknown Source', async (done) => {
  const keyring = await mockKeyring();
  const auth = await new Authentication().init();

  const unknownKey = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: keyring.party.publicKey,
      admit: keyring.devicePseudonym.key
    }, [unknownKey, keyring.devicePseudonym]),
  ];

  let hadError = false;

  for await (const message of messages) {
    try {
      await auth.processMessage(message);
    } catch (e) {
      log(e);
      hadError = true;
    }
  }

  expect(hadError).toBeTruthy();
  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(auth._keyring.get(keyring.devicePseudonym)).toBeNull();

  done();
});

test('Authentication (GOOD)', async (done) => {
  const keyring = await mockKeyring();
  const auth = await new Authentication().init();

  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(auth._keyring.findOne({ key: keyring.feed.key, type: KeyTypes.FEED }).key).toContain(keyring.feed.key);

  const credentials = await keyring.sign({
    party: keyring.party.publicKey,
    peerId: peer.publicKey,
  }, [keyring.pseudonym]);

  const ok = await auth.authenticate(credentials);
  expect(ok).toBeTruthy();

  done();
});

test('Authentication (BAD)', async (done) => {
  const keyring = await mockKeyring();
  const auth = new Authentication();

  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(auth._keyring.findOne({ key: keyring.feed.key, type: KeyTypes.FEED }).key).toContain(keyring.feed.key);


  const unknownKey = await keyring.generate();

  const credentials = await keyring.sign({
    party: keyring.party.publicKey,
    peerId: peer.publicKey,
  }, [unknownKey]);

  const ok = await auth.authenticate(credentials);
  expect(ok).toBeFalsy();

  done();
});

test('Greeter Envelopes', async (done) => {
  const keyring = await mockKeyring();
  const auth = await new Authentication().init();

  const genesis = await signMessage({
    type: AuthMessageTypes.GENESIS,
    party: keyring.party.publicKey,
    admit: keyring.pseudonym.publicKey,
    feed: keyring.feed.publicKey,
  }, [keyring.party, keyring.pseudonym, keyring.feed]);

  await auth.processMessage(genesis);

  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);

  const secondKeyring = await mockKeyring();

  const pseudo = await signMessage({
    type: AuthMessageTypes.ADMIT_KEY,
    party: keyring.party.publicKey,
    admit: secondKeyring.pseudonym.publicKey,
  }, [secondKeyring.pseudonym]);

  const envelope = await signMessage({
    type: AuthMessageTypes.ENVELOPE,
    contents: {
      ...pseudo,
      __type_url: '.dxos.party.SignedMessage'
    }
  }, [keyring.pseudonym]);

  await auth.processMessage(envelope);

  expect(auth._keyring.get(secondKeyring.pseudonym).key).toEqual(secondKeyring.pseudonym.key);

  done();
});

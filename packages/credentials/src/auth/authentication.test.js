//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Authentication, AuthMessageTypes, } from '.';
import { Keyring, KeyTypes } from '../crypto';

const log = debug('creds:authentication:test');

const signMessage = async (payload, keys) => {
  const keyring = new Keyring();
  const now = Date.now();
  return {
    id: `${now}/${Math.random().toString(36).substr(2)}`,
    timestamp: now,
    type: payload.type,
    author: keys[0].key,
    data: await keyring.sign(payload, keys)
  };
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
      party: keyring.party.key,
      admit: keyring.pseudonym.key,
      feed: keyring.feed.key,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    // A user (represented by the pseudonym key) will also need a device.
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: keyring.party.key,
      admit: keyring.devicePseudonym.key,
    }, [keyring.pseudonym, keyring.devicePseudonym]),
    // We don't actually need this feed, since the initial feed is in the Genesis message, but we want to test all types.
    await signMessage({
      type: AuthMessageTypes.ADMIT_FEED,
      party: keyring.party,
      feed: extraFeed.key,
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
      party: keyring.party.key,
      admit: keyring.pseudonym.key,
      feed: keyring.feed.key,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: keyring.party.key,
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
      party: keyring.party.key,
      admit: keyring.pseudonym.key,
      feed: keyring.feed.key,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(auth._keyring.findOne({ key: keyring.feed.key, type: KeyTypes.FEED }).key).toContain(keyring.feed.key);

  const credentials = await keyring.sign({
    party: keyring.party.key,
    peerId: peer.key,
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
      party: keyring.party.key,
      admit: keyring.pseudonym.key,
      feed: keyring.feed.key,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._keyring.get(keyring.pseudonym).key).toEqual(keyring.pseudonym.key);
  expect(auth._keyring.findOne({ key: keyring.feed.key, type: KeyTypes.FEED }).key).toContain(keyring.feed.key);


  const unknownKey = await keyring.generate();

  const credentials = await keyring.sign({
    party: keyring.party.key,
    peerId: peer.key,
  }, [unknownKey]);

  const ok = await auth.authenticate(credentials);
  expect(ok).toBeFalsy();

  done();
});

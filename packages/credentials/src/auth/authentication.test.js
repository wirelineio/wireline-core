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
  const auth = new Authentication();

  const partyKey = await keyring.generate();
  const feedKey = await keyring.generate();
  const extraFeed = await keyring.generate();

  const messages = [
    // The Genesis message is signed by the party private key and one admitted key.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: partyKey.key,
      admit: keyring.pseudonym.key,
      feed: feedKey.key,
    }, [partyKey, keyring.pseudonym, feedKey]),
    // A user (represented by the pseudonym key) will also need a device.
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: partyKey.key,
      admit: keyring.devicePseudonym.key,
    }, [keyring.pseudonym, keyring.devicePseudonym]),
    // We don't actually need this feed, since the initial feed is in the Genesis message, but we want to test all types.
    await signMessage({
      type: AuthMessageTypes.ADMIT_FEED,
      party: partyKey.key,
      feed: extraFeed.key,
    }, [keyring.devicePseudonym, extraFeed])
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._allowedKeys).toContain(keyring.pseudonym.key);
  expect(auth._allowedKeys).toContain(keyring.devicePseudonym.key);
  expect(auth._allowedFeeds).toContain(feedKey.key);
  expect(auth._allowedFeeds).toContain(extraFeed.key);

  done();
});

test('Reject Message from Unknown Source', async (done) => {
  const keyring = await mockKeyring();
  const auth = new Authentication();

  const partyKey = await keyring.generate();
  const feedKey = await keyring.generate();
  const unknownKey = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: partyKey.key,
      admit: keyring.pseudonym.key,
      feed: feedKey.key,
    }, [partyKey, keyring.pseudonym, feedKey]),
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: partyKey.key,
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
  expect(auth._allowedKeys).toContain(keyring.pseudonym.key);
  expect(auth._allowedKeys).not.toContain(keyring.devicePseudonym.key);

  done();
});

test('Authentication (GOOD)', async (done) => {
  const keyring = await mockKeyring();
  const auth = new Authentication();

  const partyKey = await keyring.generate();
  const feedKey = await keyring.generate();
  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: partyKey.key,
      admit: keyring.pseudonym.key,
      feed: feedKey.key,
    }, [partyKey, keyring.pseudonym, feedKey]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._allowedKeys).toContain(keyring.pseudonym.key);
  expect(auth._allowedFeeds).toContain(feedKey.key);

  const credentials = await keyring.sign({
    party: partyKey.key,
    peerId: peer.key,
  }, [keyring.pseudonym]);

  const ok = await auth.authenticate(credentials);
  expect(ok).toBeTruthy();

  done();
});

test('Authentication (BAD)', async (done) => {
  const keyring = await mockKeyring();
  const auth = new Authentication();

  const partyKey = await keyring.generate();
  const feedKey = await keyring.generate();
  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: partyKey.key,
      admit: keyring.pseudonym.key,
      feed: feedKey.key,
    }, [partyKey, keyring.pseudonym, feedKey]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._allowedKeys).toContain(keyring.pseudonym.key);
  expect(auth._allowedFeeds).toContain(feedKey.key);

  const unknownKey = await keyring.generate();

  const credentials = await keyring.sign({
    party: partyKey.key,
    peerId: peer.key,
  }, [unknownKey]);

  const ok = await auth.authenticate(credentials);
  expect(ok).toBeFalsy();

  done();
});

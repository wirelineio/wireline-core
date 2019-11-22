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

test('Process initial messages', async (done) => {
  const keyring = await mockKeyring();
  const auth = new Authentication();

  const partyKeys = await keyring.generate();
  const feedKeys = await keyring.generate();

  const messages = [
    // The Genesis message is signed by the party private key and one admitted key.
    await signMessage({
      type: AuthMessageTypes.GENESIS,
      party: partyKeys.key,
      admit: keyring.pseudonym.key,
      feed: feedKeys.key,
    }, [partyKeys, keyring.pseudonym, feedKeys]),
    // The admitted key (usually a pseudonym key) will typically need to admit a device pseudonym key as well.
    await signMessage({
      type: AuthMessageTypes.ADMIT_KEY,
      party: partyKeys.key,
      admit: keyring.devicePseudonym.key
    }, [keyring.pseudonym, keyring.devicePseudonym]),
  ];

  for await (const message of messages) {
    await auth.processMessage(message);
  }

  expect(auth._allowedKeys).toContain(keyring.pseudonym.key);
  expect(auth._allowedKeys).toContain(keyring.devicePseudonym.key);
  expect(auth._allowedFeeds).toContain(feedKeys.key);

  done();
});

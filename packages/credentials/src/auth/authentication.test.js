//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Authentication, } from './authentication';
import { Keyring, KeyTypes } from '../crypto';
import { partyCodec, Party, PartyMessageTypes, signPartyMessage as _signPartyMessage } from '../party';

const log = debug('creds:auth:test');

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

test('Authentication (GOOD)', async (done) => {
  const keyring = await mockKeyring();
  const party = new Party(keyring.party.publicKey);
  const auth = await new Authentication(party).init();

  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signPartyMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await party.processMessage(message);
  }

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
  const party = new Party(keyring.party.publicKey);
  const auth = await new Authentication(party).init();

  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signPartyMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await party.processMessage(message);
  }

  const unknownKey = await keyring.generate();

  const credentials = await keyring.sign({
    party: keyring.party.publicKey,
    peerId: peer.publicKey,
  }, [unknownKey]);

  const ok = await auth.authenticate(credentials);
  expect(ok).toBeFalsy();

  done();
});

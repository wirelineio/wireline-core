//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Authentication, } from './authentication';
import { Keyring, KeyTypes } from '../crypto';
import { partyCodec, Party } from '../party';
import { PartyMessageTypes } from '../party/partyMessageTypes';

const log = debug('creds:auth:test');

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

test('Authentication (GOOD)', async (done) => {
  const keyring = await mockKeyring();
  const partyConstruction = new Party();
  const auth = await new Authentication(partyConstruction).init();

  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await partyConstruction.processMessage(message);
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
  const partyConstruction = new Party();
  const auth = await new Authentication(partyConstruction).init();

  const peer = await keyring.generate();

  const messages = [
    // We always need a Genesis.
    await signMessage({
      type: PartyMessageTypes.GENESIS,
      party: keyring.party.publicKey,
      admit: keyring.pseudonym.publicKey,
      feed: keyring.feed.publicKey,
    }, [keyring.party, keyring.pseudonym, keyring.feed]),
  ];

  for await (const message of messages) {
    await partyConstruction.processMessage(message);
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

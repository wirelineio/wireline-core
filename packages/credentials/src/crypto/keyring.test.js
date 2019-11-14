//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { Keyring, KeyTypes } from '.';

const log = debug('creds:keyring:test');

const keyring = new Keyring();

test('Generate basic keys', async (done) => {
  for await (const type of Object.getOwnPropertyNames(KeyTypes)) {
    const keypair = await keyring.generate({ type });
    const match = keyring.key({ type });
    log(keypair.type, keypair.key);
    expect(keypair.key).toEqual(match.key);
  }

  done();
});

test('Sign a message with all keys', async (done) => {
  const signed = await keyring.sign('Howdy', keyring.keys);
  expect(signed.signatures.length).toEqual(keyring.keys.length);

  for (const sig of signed.signatures) {
    const { signature, key } = sig;
    const verified = await keyring.verify(signed.data, signature, keyring.key({ key }));
    expect(verified).toEqual(true);
  }

  done();
});

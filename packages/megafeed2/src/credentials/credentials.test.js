//
// Copyright 2019 Wireline, Inc.
//

import path from 'path';
import crypto from 'hypercore-crypto';

import { createCodec } from '../util/codec';

import { createItem, createPartyGenesis, signObject, verifyObject } from './helpers';

test('item genesis', async () => {

  // TODO(ashwin): Import .proto and pass in objects as string literals.
  // TODO(ashwin): Loading from string currently NOT supported (https://github.com/protobufjs/protobuf.js/issues/1162).
  const codec = await createCodec([
    path.join(__dirname, '../credentials', 'credentials.proto')
  ]);

  const user1 = crypto.keyPair();
  const user2 = crypto.keyPair();

  const item = createItem(user1.publicKey);

  {
    const buffer = codec.encode({ type: 'wirelineio.credential.ItemGenesis', message: item });
    expect(buffer).toBeDefined();

    const { type, message } = codec.decode(buffer);
    expect(type).toBe('wirelineio.credential.ItemGenesis');
    expect(message).toEqual(item);

    // Verify signature.
    expect(verifyObject(item)).toBeTruthy();
  }

  {
    // Clone the item.
    const itemClone = { ...item };

    // Tampering the ownerKey doesn't work.
    itemClone.ownerKey = user2.publicKey;
    expect(verifyObject(itemClone)).toBeFalsy();

    // Verificaton MUST fail as the item needs to be signed with the item's private key, which has been burned.
    // Check not possible to claim ownership since burned private item key is required to sign block.
    // Sign with new owners secret key.
    delete itemClone.signature;
    const signature = signObject(item, user2.secretKey);
    expect(verifyObject({ ...itemClone, signature })).toBeFalsy();
  }
});

test('party genesis', async () => {
  const codec = await createCodec([
    path.join(__dirname, '../credentials', 'credentials.proto')
  ]);

  const user1 = crypto.keyPair();
  const user2 = crypto.keyPair();

  const feedKeyPair = crypto.keyPair();

  const party = createPartyGenesis(user1.publicKey, feedKeyPair.publicKey);

  {
    const buffer = codec.encode({ type: 'wirelineio.credential.PartyGenesis', message: party });
    expect(buffer).toBeDefined();

    const { type, message } = codec.decode(buffer);
    expect(type).toBe('wirelineio.credential.PartyGenesis');
    expect(message).toEqual(party);

    // Verify signature.
    expect(verifyObject(party, 'partyKey')).toBeTruthy();
  }

  {
    // Clone the party.
    const partyClone = { ...party };

    // Tampering the ownerKey doesn't work.
    partyClone.ownerKey = user2.publicKey;
    expect(verifyObject(partyClone, 'partyKey')).toBeFalsy();

    // Verificaton MUST fail as the party needs to be signed with the party's private key, which has been burned.
    // Check not possible to claim ownership since burned private party key is required to sign block.
    // Sign with new owners secret key.
    delete partyClone.signature;
    const signature = signObject(party, user2.secretKey);
    expect(verifyObject({ ...partyClone, signature }, 'partyKey')).toBeFalsy();
  }
});

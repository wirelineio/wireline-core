//
// Copyright 2019 Wireline, Inc.
//

import path from 'path';
import crypto from 'hypercore-crypto';

import { createCodec } from './helpers';
import { createItem, signItem, verifyItem } from './credentials';

test('item genesis', async () => {
  const codec = await createCodec([
    path.join(__dirname, 'credentials.proto')
  ]);

  const user1 = crypto.keyPair();
  const item = createItem(user1.publicKey);

  {
    const buffer = codec.encode({ type: 'wireline.ItemGenesis', message: item });
    expect(buffer).toBeDefined();

    const { type, message } = codec.decode(buffer);
    expect(type).toBe('wireline.ItemGenesis');
    expect(message).toEqual(item);

    // Verify signature.
    expect(verifyItem(item)).toBeTruthy();
  }

  {
    const user2 = crypto.keyPair();

    // Clone the item, minus signature.
    const itemClone = { ...item };
    delete itemClone.signature;

    // Change owner and sign with new owners secret key.
    itemClone.ownerKey = user2.publicKey;
    const signature = signItem(item, user2.secretKey);

    // Verificaton MUST fail as the item needs to be signed with the items private key, which has been burned.
    // Basically, it's impossible for someone else to claim ownership over that item.
    expect(verifyItem({ ...itemClone, signature })).toBeFalsy();
  }
});

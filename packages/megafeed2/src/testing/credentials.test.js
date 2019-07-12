//
// Copyright 2019 Wireline, Inc.
//

import path from 'path';
import crypto from 'hypercore-crypto';

import { createCodec } from './helpers';
import { createItem, signItem, verifyItem } from './credentials';

test('item genesis', async () => {

  // TODO(ashwin): Import .ptoro and pass in objects as string literals.
  const codec = await createCodec([
    path.join(__dirname, 'credentials.proto')
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
    expect(verifyItem(item)).toBeTruthy();
  }

  {
    // Clone the item.
    const itemClone = { ...item };

    // Tampering the ownerKey doesn't work.
    itemClone.ownerKey = user2.publicKey;
    expect(verifyItem(itemClone)).toBeFalsy();

    // Verificaton MUST fail as the item needs to be signed with the item's private key, which has been burned.
    // Check not possible to claim ownership since burned private item key is required to sign block.
    // Sign with new owners secret key.
    delete itemClone.signature;
    const signature = signItem(item, user2.secretKey);
    expect(verifyItem({ ...itemClone, signature })).toBeFalsy();
  }
});

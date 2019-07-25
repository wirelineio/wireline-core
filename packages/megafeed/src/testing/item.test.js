//
// Copyright 2019 Wireline, Inc.
//

import path from 'path';
import crypto from 'hypercore-crypto'
import protobufjs from 'protobufjs';

import Codec from '@wirelineio/codec-protobuf';

import { random } from '../util';

import { ItemFactory } from './item';
import { ChessApp } from './chess';

const codec = new Codec({ verify: true });

test('item proto with signatures', async (done) => {
  codec.load(await protobufjs.load(path.join(__dirname, 'item.proto')));
  const itemType = codec.getType('item.Item');

  const itemId = random.word({ length: 16 });
  const keyPair = crypto.keyPair();

  const itemFactory = new ItemFactory(itemType);
  const item = itemFactory.createItem(ChessApp.TYPE, itemId, keyPair);

  expect(item).toBeDefined();
  expect(item.signature).toBe('');

  const signedItem = itemFactory.signItem(item, keyPair);
  expect(signedItem).toBeDefined();
  expect(signedItem.signature).toBeDefined();

  expect(itemFactory.verifyItem(signedItem, keyPair.publicKey)).toBeTruthy();

  // Tamper object, and test that signature doesn't match any more.
  signedItem.type = ChessApp.GAME_MSG;
  expect(itemFactory.verifyItem(signedItem, keyPair.publicKey)).toBeFalsy();

  done();
});

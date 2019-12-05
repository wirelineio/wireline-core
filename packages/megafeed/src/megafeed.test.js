//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import pump from 'pump';
import crypto from 'crypto';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';

import { Protocol } from '@wirelineio/protocol';
import { keyToHex, keyToBuffer } from '@wirelineio/utils';

import { Megafeed } from './megafeed';

debug.enable('test');

const createMegafeed = async (name, topic) => {
  const mega = await Megafeed.create(ram, { valueEncoding: 'utf8' });
  const feed = await mega.openFeed(`feed/${topic}/local`, { metadata: { topic } });

  feed.append(`hi from ${name}`);

  return { feed, mega };
};

const createConnect = topic => (mega1, mega2) => {
  const options = {
    streamOptions: {
      live: true
    }
  };

  const protocol1 = new Protocol(options)
    .setExtensions(mega1.createExtensions())
    .init(keyToBuffer(topic));

  const protocol2 = new Protocol(options)
    .setExtensions(mega2.createExtensions())
    .init(keyToBuffer(topic));

  return pump(protocol1.stream, protocol2.stream, protocol1.stream);
};

test('megafeed replicator', async () => {
  const topic = keyToHex(crypto.randomBytes(32));

  const { mega: mega1 } = await createMegafeed('peer1', topic);
  const { mega: mega2 } = await createMegafeed('peer2', topic);

  createConnect(topic)(mega1, mega2);

  await waitForExpect(() => {
    expect(mega1.getFeeds().length).toBe(2);
    expect(mega2.getFeeds().length).toBe(2);
  });
});

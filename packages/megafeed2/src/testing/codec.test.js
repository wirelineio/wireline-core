//
// Copyright 2019 Wireline, Inc.
//

import path from 'path';
import hypercore from 'hypercore';
import ram from 'random-access-memory';
import pify from 'pify';

import { createCodec } from '../util/codec';

test('hypercore codec', async () => {
  const codec = await createCodec([
    path.join(__dirname, 'test.proto')
  ]);

  const obj1 = { type: 'MessageOne', message: { subject: 'hi', body: 'how are you?' }};

  const feed = hypercore(ram, { valueEncoding: codec });

  await pify(feed.append.bind(feed))(obj1);
  const obj2 = await pify(feed.head.bind(feed))();

  expect(obj1).toEqual(obj2);
});

test('hypercore codec, missing type', async () => {
  const codec1 = await createCodec([ path.join(__dirname, 'test.proto') ]);
  const feed1 = hypercore(ram, { valueEncoding: codec1 });
  await pify(feed1.ready.bind(feed1))();

  const codec2 = await createCodec([]);
  const feed2 = hypercore(ram, feed1.key, { valueEncoding: codec2 });
  await pify(feed2.ready.bind(feed2))();

  const stream1 = feed1.replicate({ live: true });
  const stream2 = feed2.replicate({ live: true });

  stream1.feed(feed1.key);
  stream2.feed(feed2.key);

  stream1.pipe(stream2).pipe(stream1);

  const obj1 = { type: 'MessageOne', message: { subject: 'hi', body: 'how are you?' }};
  await pify(feed1.append.bind(feed1))(obj1);

  const obj2 = await pify(feed2.head.bind(feed2))();
  expect(obj2).toBeDefined();

  // If type not found, return raw 'buffer' but 'message' will be undefined.
  expect(obj2.type).toBe('MessageOne');
  expect(obj2.message).toBeUndefined();
  expect(obj2.buffer).toBeDefined();
});

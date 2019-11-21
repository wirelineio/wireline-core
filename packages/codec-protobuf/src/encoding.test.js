//
// Copyright 2019 Wireline, Inc.
//

import hypercore from 'hypercore';
import pify from 'pify';
import ram from 'random-access-memory';

import { Codec } from './codec';

const options = {
  rootTypeUrl: '.testing.Message'
};

const codec = new Codec(options)
  .addJson(require('./testing/message.json'))
  .addJson(require('./testing/types.json'))
  .build();

test('json ecoding', async () => {
  const feed = hypercore(ram, { valueEncoding: 'json' });

  const message = {
    bucketId: 'bucket-1'
  };

  await pify(feed.append.bind(feed))(message);
  const received = await pify(feed.get.bind(feed))(0);
  expect(received).toEqual(message);
});

test('codec ecoding', async () => {
  const feed = hypercore(ram, { valueEncoding: codec });

  const message = {
    bucketId: 'bucket-1'
  };

  await pify(feed.append.bind(feed))(message);
  const received = await pify(feed.get.bind(feed))(0);
  expect(received).toEqual(message);
});

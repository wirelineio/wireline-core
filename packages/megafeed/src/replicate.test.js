//
// Copyright 2019 Wireline, Inc.
//

const hypercore = require('hypercore');
const ram = require('random-access-memory');
const pify = require('pify');
const pump = require('pump');

const megafeed = require('./megafeed');

const key = '1c374e7c80d72faf0ac125432b9dfa93c1ee07c37fa99db5f81c81889fa9d07e';

test.skip('replicate by channel', async () => {
  const mf = megafeed(ram, key, {
    valueEncoding: 'json'
  });

  await mf.ready();

  const localFeed = await mf.addFeed({ name: 'documentOne' });

  const remoteFeed = hypercore(ram, localFeed.key.toString('hex'), {
    valueEncoding: 'json'
  });

  await pify(localFeed.append.bind(localFeed))({ message: 'hi' });
  const r1 = mf.replicate({ channel: localFeed.discoveryKey.toString('hex') });
  const r2 = remoteFeed.replicate();

  return new Promise((resolve, reject) => {
    pump(r1, r2, r1, err => {
      if (err) {
        return reject(err);
      }
      remoteFeed.get(0, (err, block) => {
        if (err) {
          return reject(err);
        }
        expect(block).toEqual({ message: 'hi' });
        resolve();
      });
    });
  });
});

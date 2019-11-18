//
// Copyright 2019 Wireline, Inc.
//

import levelup from 'levelup';
import memdown from 'memdown';
import sub from 'subleveldown';

import { arrayFromStream } from './util';

test('basic', async (done) => {

  const db = levelup(memdown());
  const test = sub(db, 'test', { valueEncoding: 'json' });

  const items = [
    { id: 'item:1', value: 100 },
    { id: 'item:2', value: 101 },
    { id: 'item:3', value: 102 },
    { id: 'item:4', value: 103 },
    { id: 'test:1', value: 104 },
  ];

  for (const item of items) {
    const { id, value } = item;
    await test.put(id, value);
  }

  const item = await test.get(items[0].id);
  expect(item).toBe(items[0].value);

  expect(await arrayFromStream(test.createKeyStream())).toEqual(items.map(item => item.id));

  let count = 0;
  test.createReadStream({
    gte: 'item:',
    lte: 'item:~'
  })
    .on('data', (data) => {
      expect(data.id).not.toBeNull();
      expect(data.value).not.toBeNull();
      count++;
    })
    .on('end', () => {
      expect(count).toBe(4);
      done();
    });
});

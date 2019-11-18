//
// Copyright 2019 Wireline, Inc.
//

import levelup from 'levelup';
import memdown from 'memdown';
import sub from 'subleveldown';

import { arrayFromStream } from './util';

test('basic', async (done) => {

  const db = levelup(memdown());
  const viewDB = sub(db, 'test', { valueEncoding: 'json' });

  const items = [
    { id: 'bucket-1/item/1', value: 100 },
    { id: 'bucket-1/item/2', value: 101 },
    { id: 'bucket-1/item/3', value: 102 },
    { id: 'bucket-1/item/4', value: 103 },
    { id: 'bucket-1/test/1', value: 104 },
  ];

  const batch = true;
  if (batch) {
    const ops = items.map(item => ({
      type: 'put',
      key: item.id,
      value: item.value
    }));

    await viewDB.batch(ops);
  } else {
    for (const item of items) {
      const { id, value } = item;
      await viewDB.put(id, value);
    }
  }

  const item = await viewDB.get(items[0].id);
  expect(item).toBe(items[0].value);

  const ids = await arrayFromStream(viewDB.createKeyStream());
  expect(ids).toEqual(items.map(item => item.id));

  let count = 0;
  viewDB.createReadStream({
    gte: 'bucket-1/item/',
    lte: 'bucket-1/item/~'
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

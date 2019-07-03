//
// Copyright 2019 Wireline, Inc.
//

import rimraf from 'rimraf';
import hypertrie from 'hypertrie';

import { Codec } from '../protocol';

import { MessageStore } from './store';

describe('repository', () => {

  let db;

  beforeAll(async () => {
    rimraf.sync('./out');
    db = new MessageStore(hypertrie('./out'), new Codec());
    await db.ready();
  });

  test('get on empty db', async () => {
    const item = await db.get('key1');
    expect(item).toBeNull();
  });

  test('list on empty db', async () => {
    const items = await db.list();
    expect(items).toHaveLength(0);
  });

  test('put/get object', async () => {
    const value1 = { value: 'value1', meta: { name: 'name1' }};
    await db.put('topic1/key1', value1);

    const value2 = { value: 'value2', meta: { name: 'name2' }};
    await db.put('topic1/key2', value2);

    expect(await db.get('topic1/key1')).toEqual(value1);
    expect(await db.get('topic1/key2')).toEqual(value2);
  });

  test('list', async () => {
    const items = await db.list('topic1');
    expect(items).toEqual([
      { value: 'value1', meta: { name: 'name1' } },
      { value: 'value2', meta: { name: 'name2' } }
    ]);

    {
      const keys = await db.keys('topic1');
      expect(keys).toEqual([ 'topic1/key1', 'topic1/key2' ]);
    }
  });

  test('delete', async () => {
    await db.delete('topic1/key2');
    expect(await db.get('topic1/key2')).toBeNull();

    const items = await db.list('topic1');
    expect(items).toEqual([
      { value: 'value1', meta: { name: 'name1' } },
    ]);
  });
});


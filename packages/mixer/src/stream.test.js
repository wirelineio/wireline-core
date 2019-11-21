//
// Copyright 2019 Wireline, Inc.
//

import levelup from 'levelup';
import memdown from 'memdown';
import pump from 'pump';
import sub from 'subleveldown';
import through from 'through2';

import { arrayFromStream } from './stream';
import { createKey } from './mixer';

const createDB = () => {
  const db = levelup(memdown());
  return sub(db, 'test', { valueEncoding: 'json' });
};

const items = [
  { id: 'bucket-1/item/1', value: 100 },
  { id: 'bucket-1/item/2', value: 101 },
  { id: 'bucket-1/item/3', value: 102 },
  { id: 'bucket-1/item/4', value: 103 },
  { id: 'bucket-1/test/1', value: 104 },
];

test('sanity tests', async () => {
  const db = createDB();

  for (const item of items) {
    const { id, value } = item;
    await db.put(id, value);
  }

  const item = await db.get(items[0].id);
  expect(item).toBe(items[0].value);
});

test('arrayFromStream', async (done) => {
  const db = createDB();

  const ops = items.map(item => ({
    type: 'put',
    key: item.id,
    value: item.value
  }));

  await db.batch(ops);

  const ids = await arrayFromStream(db.createKeyStream());
  expect(ids).toEqual(items.map(item => item.id));

  let count = 0;
  db.createReadStream({
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

test('readstream', async (done) => {
  const db = createDB();

  const ops = items.map(item => ({
    type: 'put',
    key: item.id,
    value: item.value
  }));

  await db.batch(ops);

  let count = 0;

  // TODO(burdon): Instead of kappa, get stream from FeedStore and pipe through different CRDTs.
  // TODO(burdon): Create a long-lasting subscription stream.

  // https://github.com/Level/levelup#createReadStream
  // https://nodejs.org/api/stream.html
  const stream = db.createReadStream({
    gte: createKey('bucket-1/item'),
    lte: createKey('bucket-1/item~')
  })
    .on('data', ({ key, value }) => {
      console.log(key, value);
      count++;
    })
    .on('error', (err) => {
      console.error(err);
      done(err);
    })
    .on('end', () => {
      expect(count).toEqual(items.filter(item => item.id.indexOf('bucket-1/item') === 0).length);
    })
    .on('close', () => {
      expect(stream.readable).toBeFalsy();
      done();
    });

  expect(stream.readable).toBeTruthy();
});

test('stream', async (done) => {

  // TODO(burdon): Test encoder.
  // TODO(burdon): Protocol/replicator test.
  // TODO(burdon): Replace kappa with stream that reads from FeedStore directly.
  // TODO(burdon): HOC connect directly to model (read/write methods).

  let count = 0;

  const reader = through.obj(function process(chunk, encoding, next) {
    if (++count === items.length) {
      this.end();
    }

    next();
  });

  const writer = through.obj(function process(chunk, encoding, next) {
    this.push(JSON.stringify(chunk));
    next();
  });

  // Terminates and destroys both streams when EITHER reader or writer calls end.
  pump(writer, reader, (err) => {
    if (err) {
      console.error(err);
    }

    done(err);
  });

  items.forEach((item) => {
    writer.write(item);
  });
});

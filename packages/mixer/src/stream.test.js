//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import debug from 'debug';
import hypertrie from 'hypertrie';
import levelup from 'levelup';
import memdown from 'memdown';
import pump from 'pump';
import ram from 'random-access-memory';
import sub from 'subleveldown';
import through from 'through2';

import { FeedStore } from '@dxos/feed-store';
import { Codec } from '@wirelineio/codec-protobuf';

import { arrayFromStream } from './stream';

const schema = require('./schema.json');
const types = require('./testing/types.json');

const log = debug('test');
debug.enable('test');

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

  // https://github.com/Level/levelup#createReadStream
  // https://nodejs.org/api/stream.html
  const stream = db.createReadStream({
    gte: 'bucket-1/item',
    lte: 'bucket-1/item~'
  })
    .on('data', ({ key, value }) => {
      log(key, value);
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
      // expect(stream.readable).toBeFalsy();
      done();
    });

  expect(stream.readable).toBeTruthy();
});

test('stream', async (done) => {

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

test('feedstore proto stream', async (done) => {
  const { publicKey, secretKey } = crypto.keyPair();

  const messages = [
    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Credential',
        publicKey: publicKey.toString('hex')
      }
    },

    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Mutation',
        property: 'title',
        value: 'hello world'
      }
    },

    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Chess',
        from: 'e2',
        to: 'e4'
      }
    },
    {
      bucketId: 'bucket-1',
      payload: {
        __type_url: '.testing.Chess',
        from: 'e6',
        to: 'e5'
      }
    }
  ];

  // https://www.npmjs.com/package/through2#see-also

  const options = {
    rootTypeUrl: '.dxos.Message'
  };

  const codec = new Codec(options)
    .addJson(schema)
    .addJson(types)
    .build();

  const index = hypertrie(ram, publicKey, { secretKey });
  const feedStore = new FeedStore(index, ram, {
    feedOptions: { valueEncoding: 'codec' },
    codecs: {
      codec
    }
  });

  await feedStore.initialize();

  const feed = await feedStore.openFeed('/test');

  // TODO(burdon): Replace this with Martin's FeedStore stream.
  const source = feed.createReadStream({
    live: true
  });

  const logger = through.obj(function process(message, encoding, next) {
    const { bucketId, payload: { __type_url: type } } = message;
    log('logger', bucketId, type);
    this.push(message);
    next();
  });

  const credentialProcessor = ({ payload: { publicKey } }) => log(`credential: ${publicKey}`);
  const mutationProcessor = ({ payload: { property, value } }) => log(`mutation: [${property}=>${value}]`);
  const chessProcessor = ({ payload: { from, to } }) => log(`chess: [${from}=>${to}]`);

  const stateMachines = {
    '.testing.Credential': credentialProcessor,
    '.testing.Chess': chessProcessor,
    '.testing.Mutation': mutationProcessor,
  };

  let count = 0;
  const mixer = through.obj(function process(message, encoding, next) {
    const { payload: { __type_url: type } } = message;
    const processor = stateMachines[type];
    if (processor) {
      processor(message);
    }

    if (++count === messages.length) {
      this.end();
    }

    next();
  });

  pump(source, logger, mixer, (err) => {
    if (err) {
      console.error(err);
    }

    done(err);
  });

  messages.forEach(message => feed.append(message));
});

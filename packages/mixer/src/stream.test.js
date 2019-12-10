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
import { Codec } from '@dxos/codec-protobuf';

import { arrayFromStream } from './stream';

const schema = require('./schema.json');
const types = require('./testing/types.json');

const log = debug('test');
debug.enable('test');

const createDB = () => {
  const db = levelup(memdown());
  return sub(db, 'test', { valueEncoding: 'json' });
};

const credentialProcessor = ({ payload: { publicKey } }) => log(`credential: ${publicKey}`);
const mutationProcessor = ({ payload: { property, value } }) => log(`mutation: [${property}=>${value}]`);
const chessProcessor = ({ payload: { from, to } }) => log(`chess: [${from}=>${to}]`);

const messages = [
  { id: 'bucket-1/message/1', value: 100 },
  { id: 'bucket-1/message/2', value: 101 },
  { id: 'bucket-1/message/3', value: 102 },
  { id: 'bucket-1/message/4', value: 103 },
  { id: 'bucket-1/test/1', value: 104 },
];

test('sanity tests', async () => {
  const db = createDB();

  for (const message of messages) {
    const { id, value } = message;
    await db.put(id, value);
  }

  const message = await db.get(messages[0].id);
  expect(message).toBe(messages[0].value);
});

test('arrayFromStream', async (done) => {
  const db = createDB();

  const ops = messages.map(message => ({
    type: 'put',
    key: message.id,
    value: message.value
  }));

  await db.batch(ops);

  const ids = await arrayFromStream(db.createKeyStream());
  expect(ids).toEqual(messages.map(message => message.id));

  let count = 0;
  db.createReadStream({
    gte: 'bucket-1/message/',
    lte: 'bucket-1/message/~'
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

  const ops = messages.map(message => ({
    type: 'put',
    key: message.id,
    value: message.value
  }));

  await db.batch(ops);

  let count = 0;

  // https://github.com/Level/levelup#createReadStream
  // https://nodejs.org/api/stream.html
  const stream = db.createReadStream({
    gte: 'bucket-1/message',
    lte: 'bucket-1/message~'
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
      expect(count).toEqual(messages.filter(message => message.id.indexOf('bucket-1/message') === 0).length);
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
    if (++count === messages.length) {
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

  messages.forEach((message) => {
    writer.write(message);
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
    // TODO(burdon): Doesn't make sense to maintain map; keep hypercore API.
    codecs: {
      codec
    }
  });

  await feedStore.initialize();

  const feed = await feedStore.openFeed('/test');

  const source = feed.createReadStream({
    live: true
  });

  const logger = through.obj(function process(message, encoding, next) {
    const { bucketId, payload: { __type_url: type } } = message;
    log('logger', bucketId, type);
    this.push(message);
    next();
  });

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

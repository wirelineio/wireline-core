//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import crypto from 'hypercore-crypto';

import { ProtocolError } from '@wirelineio/protocol';

import { TokenGreeter } from './tokenGreeter';

const log = debug('creds:test');
const PARTY = crypto.randomBytes(32).toString('hex');

test('Good token', async (done) => {
  const greeter = new TokenGreeter(() => {}, () => {});
  const token = await greeter.issueToken({ party: PARTY });

  const message = {
    token: token.token,
    party: token.party,
    command: 'negotiate',
  };

  await greeter.handleMessage(message);

  done();
});

test('Bad token', async (done) => {
  const greeter = new TokenGreeter(() => {}, () => {});
  const token = await greeter.issueToken({ party: PARTY });

  const message = {
    token: 'bad',
    party: token.party,
    command: 'negotiate',
  };

  try {
    await greeter.handleMessage(message);
    done.fail();
  } catch (e) {
    log(e);
    expect(e).toBeInstanceOf(ProtocolError);
  }

  done();
});

test('Re-use token', async (done) => {
  const greeter = new TokenGreeter(() => {}, () => {});
  const token = await greeter.issueToken({ party: PARTY });

  const message = {
    token: token.token,
    party: token.party,
    command: 'negotiate',
  };

  await greeter.handleMessage(message);

  try {
    await greeter.handleMessage(message);
    done.fail();
  } catch (e) {
    log(e);
    expect(e).toBeInstanceOf(ProtocolError);
  }

  done();
});

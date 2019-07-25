//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import debug from 'debug';
import pump from 'pump';

import { Protocol } from '@wirelineio/protocol';

import { keyStr, latch } from '../util';
import { Authenticator } from './authenticator';
import { AuthProvider } from './helpers';

const log = debug('test');
debug.enable('test,protocol');

test('authenticator', async done => {
  const { publicKey: rendezvousKey } = crypto.keyPair();

  const user1AuthProvider = new AuthProvider(crypto.keyPair());
  const user2AuthProvider = new AuthProvider(crypto.keyPair());

  const authenticator1 = new Authenticator(user1AuthProvider);
  const authenticator2 = new Authenticator(user2AuthProvider);

  const protocol1 = new Protocol()
    .setUserData({ user: keyStr(user1AuthProvider.publicKey) })
    .setExtensions([ authenticator1.createExtension() ])
    .init(rendezvousKey);

  const protocol2 = new Protocol()
    .setUserData({ user: keyStr(user2AuthProvider.publicKey) })
    .setExtensions([ authenticator2.createExtension() ])
    .init(rendezvousKey);

  pump(protocol1.stream, protocol2.stream, protocol1.stream, (err) => { err && done(err); });

  const eventHandler = latch(2, () => {
    log('Auth successful.');
    done();
  });

  protocol1.getExtension('authenticator').on('auth:success', eventHandler);
  protocol2.getExtension('authenticator').on('auth:success', eventHandler);
});

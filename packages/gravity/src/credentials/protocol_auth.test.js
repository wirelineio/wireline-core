//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import debug from 'debug';
import pump from 'pump';

import { Protocol, Extension } from '@wirelineio/protocol';
import { keyStr, random } from '../util';

import { AuthProvider, createAuthProofPayload, verifyAuthProof } from './helpers';

const log = debug('test');
debug.enable('test,protocol');

test('protocol auth', async done => {
  const extension = 'auth';
  const timeout = 1000;

  const { publicKey: rendezvousKey } = crypto.keyPair();
  const user1AuthProvider = new AuthProvider(crypto.keyPair());
  const user2AuthProvider = new AuthProvider(crypto.keyPair());

  const protocol1 = new Protocol()
    .setUserData({ user: keyStr(user1AuthProvider.publicKey) })
    .setExtension(new Extension(extension, { timeout })
      .setHandshakeHandler(async (protocol) => {
        const auth = protocol.getExtension(extension);

        auth.on('error', err => {
          log('Auth error: %o', err);
          protocol.stream.destroy();
        });

        const nonce = random.prime();
        const { response: { proof } } = await auth.send({
          type: 'challenge',
          request: createAuthProofPayload(user2AuthProvider.publicKey, nonce)
        });

        const verified = verifyAuthProof(proof, nonce, keyStr(user2AuthProvider.publicKey));
        if (!verified) {
          // Close stream if auth fails.
          auth.emit('auth:error');
          return protocol.stream.destroy();
        }

        auth.emit('auth:success');
      }))
    .init(rendezvousKey);

  const protocol2 = new Protocol()
    .setUserData({ user: keyStr(user2AuthProvider.publicKey) })
    .setExtension(new Extension(extension, { timeout })
      .setMessageHandler(async (protocol, context, { type, request }) => {
        switch (type) {
          case 'challenge': {
            return {
              proof: await user2AuthProvider.requestSignature(request)
            }
          }

          // Error.
          default: {
            throw new Error('Invalid type: ' + type);
          }
        }
      }))
    .init(rendezvousKey);

  pump(protocol1.stream, protocol2.stream, protocol1.stream, (err) => { err && done(err); });

  protocol1.getExtension('auth').on('auth:success', () => {
    done();
  });
});

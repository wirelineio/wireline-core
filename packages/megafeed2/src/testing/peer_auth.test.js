//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import debug from 'debug';
import pump from 'pump';

import { Protocol, Extension } from '../protocol';
import { random } from '../util';

import { AuthProvider, createAuthProofPayload, verifyAuthProof } from './credentials';

const log = debug('test');
debug.enable('test,protocol');

test('protocol auth', async done => {
  const extension = 'auth';
  const timeout = 1000;

  const { publicKey } = crypto.keyPair();
  const user1AuthProvider = new AuthProvider(crypto.keyPair());
  const user2AuthProvider = new AuthProvider(crypto.keyPair());

  const protocol1 = new Protocol()
    .setUserData({ user: user1AuthProvider.publicKey.toString('hex') })
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

        const verified = verifyAuthProof(proof, nonce, user2AuthProvider.publicKey.toString('hex'));
        if (!verified) {
          // Close stream if auth fails.
          auth.emit('auth:error');
          return protocol.stream.destroy();
        }

        auth.emit('auth:success');
      }))
    .init(publicKey);

  const protocol2 = new Protocol()
    .setUserData({ user: user2AuthProvider.publicKey.toString('hex') })
    .setExtension(new Extension(extension, { timeout })
      // TODO(ashwin): Make auth message handlers symmetric.
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
    .init(publicKey);

  pump(protocol1.stream, protocol2.stream, protocol1.stream, (err) => { err && done(err); });

  protocol1.getExtension('auth').on('auth:success', () => {
    done();
  });
});

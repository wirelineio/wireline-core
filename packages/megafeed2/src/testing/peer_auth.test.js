//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import debug from 'debug';
import pump from 'pump';

import { Extension } from '../protocol/extension';
import { Protocol } from '../protocol/protocol';
import { random } from '../util';

import { createAuthProof, verifyAuthProof } from './credentials';

const log = debug('test');
debug.enable('test,protocol');

test('protocol auth', async done => {
  const extension = 'auth';
  const timeout = 1000;

  const { publicKey } = crypto.keyPair();
  const user1KeyPair = crypto.keyPair();
  const user2KeyPair = crypto.keyPair();

  const protocol1 = new Protocol()
    .setUserData({ user: user1KeyPair.publicKey.toString('hex') })
    .setExtension(new Extension(extension, { timeout })
      .setHandshakeHandler(async (protocol) => {
        const auth = protocol.getExtension(extension);

        auth.on('error', err => {
          log('Error: %o', err);
          done(err);
        });

        {
          const nonce = random.prime();
          const { context, response: { proof } } = await auth.send({
            type: 'challenge',
            // TODO(ashwin): Encode using codec.
            request: {
              type: 'wrn:protobuf:wirelineio.credential.Auth',
              key: user2KeyPair.publicKey.toString('hex'),
              nonce
            }
          });

          expect(context.user).toEqual(user2KeyPair.publicKey.toString('hex'));
          expect(proof).toBeDefined();
          expect(verifyAuthProof(proof, nonce, user2KeyPair.publicKey.toString('hex'))).toBeTruthy();

          // TODO(ashwin): Close connection if auth fails?
          // TODO(ashwin): Emit authenticated event on protocol object?

          log('%o', proof);
        }

        done();
      }))
    .init(publicKey);

  const protocol2 = new Protocol()
    .setUserData({ user: user2KeyPair.publicKey.toString('hex') })
    .setExtension(new Extension(extension, { timeout })
      // TODO(ashwin): Make auth message handlers symmetric.
      .setMessageHandler(async (protocol, context, { type, request }) => {
        // Check credentials.
        if (!context.user) {
          throw new Error('Not authorized');
        }

        switch (type) {
          case 'challenge': {
            log('%o', request);

            return {
              // TODO(ashwin): Decode using codec.
              // TODO(ashwin): Should Protocol have access to the private key directly?
              // TODO(ashwin): If no, how should the auth extension be configured? Pass in a `signer` function?
              proof: createAuthProof(user2KeyPair, request.nonce)
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
});

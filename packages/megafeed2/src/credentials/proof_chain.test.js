//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';

import { times } from '../util/debug';

import { createFeedGenesis, createPartyGenesis, createPartyInvite, verifyPartyProofChain } from './helpers';

test('party proof chain', async () => {

  const numFeeds = 5;

  const feedOwners = times(numFeeds, crypto.keyPair);
  const feedKeys = times(numFeeds, crypto.keyPair);

  const partyOwner = feedOwners[0];
  const partyGenesis = createPartyGenesis(partyOwner.publicKey, feedKeys[0].publicKey);
  const partyKey = Buffer.from(partyGenesis.key, 'hex');

  const proofChain = [];
  proofChain.push({ partyGenesis });

  // Add new party members.
  for (let i = 1 ; i < feedKeys.length; i++) {
    const inviteeFeedKeyPair = feedKeys[i];
    const { publicKey: inviteeFeedKey } = inviteeFeedKeyPair;
    const { publicKey: inviteePublicKey } = feedOwners[i];
    const inviterFeedKeyPair = feedKeys[i - 1];
    const { publicKey: inviterFeedKey, secretKey: inviterSecretKey } = inviterFeedKeyPair;

    const feedGenesis = createFeedGenesis(inviteeFeedKeyPair, inviteePublicKey, partyKey);
    const partyInvite = createPartyInvite(partyKey,{
      feedKey: inviterFeedKey,
      secretKey: inviterSecretKey
    }, {
      ownerKey: inviteePublicKey,
      feedKey: inviteeFeedKey
    });

    proofChain.push({ feedGenesis, partyInvite });
  }

  const { verified } = await verifyPartyProofChain(partyGenesis.key, proofChain);
  expect(verified).toBeTruthy();
});

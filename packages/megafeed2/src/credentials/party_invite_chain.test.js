//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';

import { times } from '../util/debug';

import { createFeedGenesis, createPartyGenesis, createPartyInvite, verifyPartyInviteChain } from './helpers';

test('party invite chain', async () => {

  const numFeeds = 5;

  const feedOwners = times(numFeeds, crypto.keyPair);
  const feedKeys = times(numFeeds, crypto.keyPair);

  const keyToGenesisBlock = new Map();

  // Asynchronously load the genesis block for a feed given the key.
  // It might, for example, sparse replicate the feed from a peer and request block zero.
  const genesisBlockLoader = async (feedKey) => {
    return keyToGenesisBlock.get(feedKey);
  };

  const partyOwner = feedOwners[0];
  const partyGenesis = createPartyGenesis(partyOwner.publicKey, feedKeys[0].publicKey);
  const partyKey = Buffer.from(partyGenesis.partyKey, 'hex');
  keyToGenesisBlock.set(partyGenesis.feedKey, partyGenesis);

  const inviteChain = [];
  inviteChain.push(partyGenesis);

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

    keyToGenesisBlock.set(feedGenesis.feedKey, feedGenesis);
    inviteChain.push(partyInvite);
  }

  const { verified, error } = await verifyPartyInviteChain(partyGenesis.partyKey, inviteChain, genesisBlockLoader);
  expect(error).toBeUndefined();
  expect(verified).toBeTruthy();
});

//
// Copyright 2019 Wireline, Inc.
//

import { Keyring } from '../crypto';

export const PartyMessageTypes = Object.freeze({
  GENESIS: 'party.genesis',
  ADMIT_KEY: 'party.admit.key',
  ADMIT_FEED: 'party.admit.feed',
  ENVELOPE: 'party.envelope',
});

export const signPartyMessage = async (message, keys) => {
  const keyring = new Keyring();

  switch (message.type) {
    case PartyMessageTypes.GENESIS:
      message.__type_url = '.dxos.party.PartyGenesis';
      break;
    case PartyMessageTypes.ADMIT_KEY:
      message.__type_url = '.dxos.party.KeyAdmit';
      break;
    case PartyMessageTypes.ADMIT_FEED:
      message.__type_url = '.dxos.party.FeedAdmit';
      break;
    case PartyMessageTypes.ENVELOPE:
      message.__type_url = '.dxos.party.Envelope';
      break;
    default:
      throw new Error(`Bad message type: ${message.type}`);
  }

  return {
    __type_url: '.dxos.party.SignedMessage',
    ...await keyring.sign(message, keys)
  };
};

//
// Copyright 2019 Wireline, Inc.
//

const pify = require('pify');

// utils
const { keyToHex } = require('./utils/keys');

module.exports = function createStorage(root) {
  const pPut = pify(root.put.bind(root));
  const pGet = pify(root.get.bind(root));
  const pDel = pify(root.del.bind(root));
  const pList = pify(root.list.bind(root));

  return {
    getPartyList: async ({ codec }) => {
      const list = await pList('party/');
      return list.map(({ value }) => codec.decode(value));
    },
    getParty: (key, { codec }) => pGet(`party/${keyToHex(key)}`, { valueEncoding: codec }),
    putParty: (party, { encode }) => pPut(`party/${keyToHex(party.name)}`, encode(party)),
    delParty: key => pDel(`party/${keyToHex(key)}`)
  };
};

//
// Copyright 2019 Wireline, Inc.
//

const pify = require('pify');
const hypertrie = require('hypertrie');

// utils
const { keyToHex } = require('./utils/keys');

module.exports = function createRoot(storage, rootKey, opts) {
  const root = hypertrie(storage, rootKey, Object.assign({}, opts, {
    valueEncoding: undefined
  }));

  const pPut = pify(root.put.bind(root));
  const pGet = pify(root.get.bind(root));
  const pDel = pify(root.del.bind(root));
  const pList = pify(root.list.bind(root));
  root.pClose = pify(root.feed.close.bind(root.feed));

  root.getFeedList = ({ codec }) => pList('feed/', { valueEncoding: codec });
  root.getFeed = (key, { codec }) => pGet(`feed/${keyToHex(key)}`, { valueEncoding: codec });
  root.putFeed = (feed, { encode }) => pPut(`feed/${keyToHex(feed.key)}`, encode(feed));
  root.delFeed = key => pDel(`feed/${keyToHex(key)}`);

  root.getPartyList = ({ codec }) => pList('party/', { valueEncoding: codec });
  root.getParty = (key, { codec }) => pGet(`party/${keyToHex(key)}`, { valueEncoding: codec });
  root.putParty = (party, { encode }) => pPut(`party/${keyToHex(party.name)}`, encode(party));
  root.delParty = key => pDel(`party/${keyToHex(key)}`);

  return root;
};

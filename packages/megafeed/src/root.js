//
// Copyright 2019 Wireline, Inc.
//

const pify = require('pify');
const hypertrie = require('hypertrie');

const schema = require('./schema');

// utils
const codecProtobuf = require('./utils/codec-protobuf');
const { keyToHex } = require('./utils/keys');

module.exports = function initializeRootFeed(storage, key, opts) {
  const root = hypertrie(storage, key, Object.assign({}, opts, {
    valueEncoding: codecProtobuf(schema, {
      Feed: 0,
      Party: 1,
    }),
  }));

  root.pPut = pify(root.put.bind(root));
  root.pGet = pify(root.get.bind(root));
  root.pDel = pify(root.del.bind(root));
  root.pList = pify(root.list.bind(root));
  root.pCloseFeed = pify(root.feed.close.bind(root.feed));

  root.getFeedList = () => root.pList('feed/');
  root.getFeed = key => root.pGet(`feed/${keyToHex(key)}`);
  root.putFeed = feed => root.pPut(`feed/${keyToHex(feed.key)}`, { type: 'Feed', message: feed });
  root.delFeed = key => root.pDel(`feed/${keyToHex(key)}`);

  root.getPartyList = () => root.pList('party/');
  root.getParty = key => root.pGet(`party/${keyToHex(key)}`);
  root.putParty = party => root.pPut(`party/${keyToHex(party.name)}`, { type: 'Party', message: party });
  root.delParty = key => root.pDel(`party/${keyToHex(key)}`);

  return root;
};

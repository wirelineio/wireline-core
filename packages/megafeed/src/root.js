//
// Copyright 2019 Wireline, Inc.
//

const pify = require('pify');
const hypertrie = require('hypertrie');

const { keyToHex } = require('@wirelineio/utils');

module.exports = function createRoot(storage, rootKey, opts) {
  const root = hypertrie(storage, rootKey, Object.assign({}, opts, {
    valueEncoding: undefined
  }));

  const pPut = pify(root.put.bind(root));
  const pGet = pify(root.get.bind(root));
  const pDel = pify(root.del.bind(root));
  const pList = pify(root.list.bind(root));
  root.pReady = pify(root.ready.bind(root));
  root.pClose = pify(root.feed.close.bind(root.feed));

  root.getFeedList = async ({ codec }) => {
    const list = await pList('feed/');
    return list.map(({ value }) => codec.decode(value));
  };
  root.getFeed = (key, { codec }) => pGet(`feed/${keyToHex(key)}`, { valueEncoding: codec });
  root.putFeed = (feed, { encode }) => pPut(`feed/${keyToHex(feed.key)}`, encode(feed));
  root.delFeed = key => pDel(`feed/${keyToHex(key)}`);

  return root;
};

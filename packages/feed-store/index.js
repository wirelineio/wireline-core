//
// Copyright 2019 Wireline, Inc.
//

const FeedStore = require('./src/feed-store');
const { getStat, FeedDescriptor } = require('./src/feed-descriptor');

module.exports = {
  FeedDescriptor,
  FeedStore,
  getStat
};

//
// Copyright 2019 Wireline, Inc.
//

const mm = require('micromatch');

const { keyToHex, getDiscoveryKey } = require('./keys');

const parseMetadata = (metadata) => {
  try {
    return Buffer.isBuffer(metadata) ? JSON.parse(metadata) : metadata;
  } catch (err) {
    return null;
  }
};

const filterDescriptorByPattern = (feed, pattern) => {
  const list = [feed.path, keyToHex(feed.key), keyToHex(getDiscoveryKey(feed.key))].filter(Boolean);

  if (feed.secretKey) {
    list.push(keyToHex(feed.secretKey));
  }

  const matches = mm(list, pattern);

  return matches.length > 0;
};

const parsePartyPattern = (party) => {
  const metadata = parseMetadata(party.metadata);

  return metadata && metadata.filter ? metadata.filter : '*';
};

module.exports = {
  filterDescriptorByPattern,
  parsePartyPattern
};

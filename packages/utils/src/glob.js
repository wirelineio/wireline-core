//
// Copyright 2019 Wireline, Inc.
//

const mm = require('micromatch');

const { keyToHex, getDiscoveryKey } = require('./keys');

// TODO(burdon): Should not be part of util. HAS NOTHING TO DO WITH PARTIES.
const parseMetadata = (metadata) => {
  try {
    return Buffer.isBuffer(metadata) ? JSON.parse(metadata) : metadata;
  } catch (err) {
    // TODO(burdon): Cannot fail silently.
    return null;
  }
};

// TODO(burdon): Remove.
const filterFeedByPattern = feed => (pattern) => {
  const list = [feed.name, keyToHex(feed.key), keyToHex(getDiscoveryKey(feed.key))].filter(Boolean);

  if (feed.secretKey) {
    list.push(keyToHex(feed.secretKey));
  }

  const matches = mm(list, pattern);

  return matches.length > 0;
};

// TODO(burdon): Remove.
const parsePartyPattern = (party) => {
  const metadata = parseMetadata(party.metadata);

  return metadata && metadata.filter ? metadata.filter : '*';
};

module.exports = { filterFeedByPattern, parsePartyPattern };

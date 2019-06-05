const mm = require('micromatch');

const { keyToHex, getDiscoveryKey } = require('./keys');

const parseMetadata = (buffer) => {
  try {
    return JSON.parse(buffer);
  } catch (err) {
    return null;
  }
};

const filterFeedByPattern = pattern => (feed) => {
  const list = [feed.name, keyToHex(feed.key), keyToHex(getDiscoveryKey(feed.key))].filter(Boolean);

  if (feed.secretKey) {
    list.push(keyToHex(feed.secretKey));
  }

  const matches = mm(list, pattern);

  return matches.length > 0;
};

const buildPartyFeedFilter = (party) => {
  const metadata = parseMetadata(party.metadata);

  const pattern = metadata && metadata.filter ? metadata.filter : '*';

  return filterFeedByPattern(pattern);
};

module.exports = { filterFeedByPattern, buildPartyFeedFilter };

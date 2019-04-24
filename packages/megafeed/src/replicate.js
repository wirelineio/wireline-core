//
// Copyright 2019 Wireline, Inc.
//

const protocol = require('hypercore-protocol');
const { resolveCallback } = require('./utils/promise-help');

const debug = require('debug')('megafeed:replicate');

module.exports = function replicate(partyDiscoveryKey, opts = {}) {
  let stream, party, partyFeed, peer;

  opts = Object.assign(
    { id: this.id, extensions: [] },
    opts
  );

  opts.extensions.push('party');

  if (partyDiscoveryKey) {
    party = this.party(partyDiscoveryKey);
  }

  const addInitialFeed = dk => {
    if (party.isFeed) {
      let feed = this.feedByDK(dk);

      if (feed) {
        feed.replicate(Object.assign({}, opts, { stream }));
        return;
      }

      this.addFeed({ key: party.key }, (err, feed) => {
        if (err) {
          throw err;
        }

        feed.replicate(Object.assign({}, opts, { stream }));
      });
    } else {
      stream.feed(party.key);
    }
  };

  const add = discoveryKey => {
    this.ready(err => {
      if (err) return stream.destroy(err);
      if (stream.destroyed) return;

      if (!party) {
        const remoteParty = this.party(discoveryKey);
        if (remoteParty) {
          party = remoteParty;
          addInitialFeed(discoveryKey);
        }
        return;
      }

      const feed = this.feedByDK(discoveryKey);
      if (feed && peer) {
        peer.replicate(feed);
      }
    });
  };

  if (party) {
    const { replicateOptions = {} } = party.rules;
    opts = Object.assign({}, opts, replicateOptions);
  }

  stream = protocol(opts);

  if (party) {
    addInitialFeed(partyDiscoveryKey);
  }

  stream.on('feed', add);

  stream.once('handshake', () => {
    partyFeed = stream.feeds[0];
    peer = this.addPeer({ party, stream, feed: partyFeed, opts });
    resolveCallback(party.rules.handshake({ peer }), err => {
      debug('Rule handshake', err);
    });
  });

  return stream;
};

//
// Copyright 2019 Wireline, Inc.
//

const protocol = require('hypercore-protocol');
const debug = require('debug')('megafeed:replicate');

const { resolveCallback } = require('./utils/promise-help');

module.exports = function replicate(partyDiscoveryKey, options = {}) {
  let stream; let party; let partyFeed; let
    peer;

  let opts = Object.assign(
    { id: this.id, extensions: [] },
    options,
  );

  opts.extensions.push('party');

  if (partyDiscoveryKey) {
    party = this.party(partyDiscoveryKey);
  }

  const addInitialFeed = (dk) => {
    if (party.isFeed) {
      const feed = this.feedByDK(dk);

      if (feed) {
        feed.replicate(Object.assign({}, opts, { stream }));
        return;
      }

      this.addFeed({ key: party.key }, (err, newFeed) => {
        if (err) {
          throw err;
        }

        newFeed.replicate(Object.assign({}, opts, { stream }));
      });
    } else {
      stream.feed(party.key);
    }
  };

  const add = (discoveryKey) => {
    this.ready((err) => {
      if (err) return stream.destroy(err);
      if (stream.destroyed) return null;

      if (!party) {
        const remoteParty = this.party(discoveryKey);
        if (remoteParty) {
          party = remoteParty;
          addInitialFeed(discoveryKey);
        }
        return null;
      }

      const feed = this.feedByDK(discoveryKey);
      if (feed && peer) {
        peer.replicate(feed);
      }

      return null;
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
    [partyFeed] = stream.feeds;

    peer = this.addPeer({
      party, stream, feed: partyFeed, opts,
    });

    resolveCallback(party.rules.handshake({ peer }), (err) => {
      debug('Rule handshake', err);
    });
  });

  return stream;
};

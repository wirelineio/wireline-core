//
// Copyright 2019 Wireline, Inc.
//

const discoverySwarmWebrtc = require('@geut/discovery-swarm-webrtc');
const debug = require('debug')('dsuite:swarm');

const { Protocol } = require('@wirelineio/protocol');
const { keyToHex } = require('@wirelineio/utils');

const Metric = require('../utils/metric');
const Config = require('../config');

const isBrowser = typeof window !== 'undefined';

function createExtensions(extensions) {
  return extensions.reduce((result, next) => {
    let extension = next;

    if (typeof extension === 'function') {
      extension = extension();
    }

    if (Array.isArray(extension)) {
      return [...result, ...extension];
    }

    return [...result, extension];
  }, []);
}

/**
 * Creates the swarm.
 *
 * @param mega
 * @param conf
 * @return {*|DiscoverySwarmWebrtc}
 */
module.exports = function createSwarm(id, topic, options = {}) {
  console.assert(id);
  console.assert(topic);

  id = keyToHex(id);

  const signalhub = options.hub || process.env.SIGNALHUB || Config.SIGNALHUB;
  const ice = JSON.parse(options.ice || process.env.ICE_SERVERS || Config.ICE_SERVERS);
  const extensions = options.extensions || [];
  const maxPeers = options.maxPeers || process.env.SWARM_MAX_PEERS;
  const emit = options.emit || (() => {});

  debug('Connecting:', JSON.stringify({ signalhub, ice }));
  debug('PeerId:', id);

  const swarm = options.swarm || discoverySwarmWebrtc;

  const sw = swarm({
    id,

    urls: Array.isArray(signalhub) ? signalhub : [signalhub],

    // Maximum number of peer candidates requested from the signaling server (but can have multiple in-coming).
    maxPeers,

    // TODO(burdon): Get's the main hypercore stream (not actually the feed replication stream).
    stream: () => {
      return new Protocol({
        streamOptions: {
          id,
          live: true
        }
      })
        .setUserData({ peerId: id })
        .setExtensions(createExtensions(extensions))
        .init(topic)
        .stream;
      // TODO(martin): Should be dynamic using info.channel but for now static is fine.
      // .init(info.channel);
    },

    simplePeer: {
      wrtc: !isBrowser ? require('wrtc') : null, // eslint-disable-line global-require
      config: {
        iceServers: ice
      }
    }
  });

  const hasSignal = sw.signal && sw.signal.info;

  const getPeersCount = (channel) => {
    try {
      return sw.peers(channel).filter(peer => peer.connected).length;
    } catch (err) {
      return 0;
    }
  };

  const infoMessage = message => hasSignal && sw.signal.info(message);

  sw.on('connection', (peer, info) => {
    infoMessage({ type: 'connection', channel: info.channel, peers: [id, info.id] });

    debug('Connection open:', info.id);
    emit('metric.swarm.connection-open', {
      value: getPeersCount(info.channel),
      peer,
      info,
      swarm: sw
    });
  });

  sw.on('connection-closed', (peer, info) => {
    infoMessage({ type: 'disconnection', channel: info.channel, peers: [id, info.id] });

    debug('Connection closed:', info.id);
    emit('metric.swarm.connection-closed', {
      value: getPeersCount(info.channel),
      peer,
      info,
      swarm: sw
    });
  });

  sw.on('connection-error', (err, info) => {
    // If we have info.id the error is just an already closed connection.
    if (info && info.id) {
      debug(`Unreachable peer: ${info.id}. Peer might have disconnected.`);
    } else {
      debug('Connection error:', err);
    }

    emit('metric.swarm.connection-error', {
      err,
      info,
      swarm: sw
    });
  });

  sw.on('reconnecting', (info) => {
    debug('Reconnecting:', info);

    emit('metric.swarm.reconnecting', {
      info,
      swarm: sw
    });
  });

  sw.on('info', (info) => {
    const value = {
      id,
      channel: info.channel,
      connections: info.connections
    };

    emit('metric.swarm.network-updated', {
      value: new Metric(value, value => value.connections.length),
      info,
      swarm: sw
    });
  });

  return sw;
};

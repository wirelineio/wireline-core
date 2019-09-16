//
// Copyright 2019 Wireline, Inc.
//

const discoverySwarmWebrtc = require('@geut/discovery-swarm-webrtc');
const debug = require('debug')('dsuite:swarm');

const { Protocol } = require('@wirelineio/protocol');
const { keyToHex, getDiscoveryKey, keyToBuffer } = require('@wirelineio/utils');

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
 * @param id
 * @param topic
 * @param options
 * @return {*|DiscoverySwarmWebrtc}
 */
module.exports = function createSwarm(id, topic, options = {}) {
  console.assert(id);
  console.assert(topic);

  const idHex = keyToHex(id);

  const { extensions = [], emit = () => {}, discoveryToPublicKey } = options;

  // TODO(burdon): IMPORTANT: Env vars should only be used by the root app. Otherwise must set in the function config.
  const signalhub = options.hub || process.env.SIGNALHUB || Config.SIGNALHUB;
  const ice = JSON.parse(options.ice || process.env.ICE_SERVERS || Config.ICE_SERVERS);
  const maxPeers = options.maxPeers || process.env.SWARM_MAX_PEERS;

  debug('Connecting:', JSON.stringify({ signalhub, ice }));
  debug('PeerId:', idHex);

  const protocolOptions = {
    discoveryToPublicKey: (dk) => {
      if (dk.equals(getDiscoveryKey(topic))) {
        return topic;
      }

      if (discoveryToPublicKey) {
        return discoveryToPublicKey(dk);
      }

      return null;
    },

    streamOptions: {
      id: idHex,
      live: true
    }
  };

  const swarm = options.swarm || discoverySwarmWebrtc;

  const sw = swarm({
    id,

    // TODO(burdon): Temp fix.
    bootstrap: Array.isArray(signalhub) ? signalhub : [signalhub],
    urls: Array.isArray(signalhub) ? signalhub : [signalhub],

    // Maximum number of peer candidates requested from the signaling server (but can have multiple in-coming).
    maxPeers,

    // TODO(burdon): Get's the main hypercore stream (not actually the feed replication stream).
    stream: ({ channel }) => new Protocol(protocolOptions)
      .setUserData({ peerId: idHex })
      .setExtensions(createExtensions(extensions))
      .init(keyToBuffer(channel))
      .stream,

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

  const parseInfo = info => ({ id: keyToHex(info.id), channel: keyToHex(info.id) });

  sw.on('connection', (peer, info) => {
    info = parseInfo(info);

    infoMessage({ type: 'connection', channel: info.channel, peers: [idHex, info.id] });

    debug('Connection open:', info.id);
    emit('metric.swarm.connection-open', {
      value: getPeersCount(info.channel),
      peer,
      info,
      swarm: sw
    });
  });

  sw.on('connection-closed', (peer, info) => {
    info = parseInfo(info);

    infoMessage({ type: 'disconnection', channel: info.channel, peers: [idHex, info.id] });

    debug('Connection closed:', info.id);
    emit('metric.swarm.connection-closed', {
      value: getPeersCount(info.channel),
      peer,
      info,
      swarm: sw
    });
  });

  sw.on('connection-error', (err, info) => {
    info = parseInfo(info);

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
    info = parseInfo(info);

    debug('Reconnecting:', info);

    emit('metric.swarm.reconnecting', {
      info,
      swarm: sw
    });
  });

  sw.on('info', (info) => {
    info = parseInfo(info);

    const value = {
      id: idHex,
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

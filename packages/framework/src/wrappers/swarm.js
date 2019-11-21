//
// Copyright 2019 Wireline, Inc.
//

const discoverySwarmWebrtc = require('@geut/discovery-swarm-webrtc');
const debug = require('debug')('dsuite:swarm');

const { Protocol } = require('@wirelineio/protocol');
const { keyToHex, getDiscoveryKey, keyToBuffer } = require('@wirelineio/utils');

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
  const signalhub = options.hub || process.env.WIRE_SIGNAL_ENDPOINT || Config.WIRE_SIGNAL_ENDPOINT;
  const ice = JSON.parse(options.ice || process.env.WIRE_ICE_ENDPOINTS || Config.WIRE_ICE_ENDPOINTS);
  const maxPeers = options.maxPeers || process.env.WIRE_SWARM_MAX_PEERS;

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

  const userData = options.userData || { peerId: idHex };
  const defaultOptions = {
    id,
    stream: ({ channel }) => new Protocol(protocolOptions)
      .setUserData(userData)
      .setExtensions(createExtensions(extensions))
      .init(keyToBuffer(channel))
      .stream,
  };

  const swarm = options.swarm || discoverySwarmWebrtc;

  let sw;
  // It's swarm webrc
  if (swarm === discoverySwarmWebrtc) {
    sw = swarm(Object.assign({}, defaultOptions, {
      bootstrap: Array.isArray(signalhub) ? signalhub : [signalhub],

      maxPeers,

      simplePeer: {
        wrtc: !isBrowser ? require('wrtc') : null, // eslint-disable-line global-require
        config: {
          iceServers: ice
        }
      }
    }));
  } else {
    sw = swarm(defaultOptions);
  }

  const getPeersCount = (channel) => {
    try {
      return sw.getPeers(channel).filter(peer => peer.connected).length;
    } catch (err) {
      return 0;
    }
  };

  const parseInfo = info => ({ id: keyToHex(info.id), channel: keyToHex(info.channel) });

  sw.on('connection', (peer, info) => {
    debug('Connection open:', keyToHex(info.id));
    emit('metric.swarm.connection-open', {
      value: getPeersCount(info.channel),
      peer,
      info: parseInfo(info),
      swarm: sw
    });
  });

  sw.on('connection-closed', (peer, info) => {
    debug('Connection closed:', keyToHex(info.id));
    emit('metric.swarm.connection-closed', {
      value: getPeersCount(info.channel),
      peer,
      info: parseInfo(info),
      swarm: sw
    });
  });

  sw.on('connection-error', (err, info) => {
    emit('metric.swarm.connection-error', {
      err,
      info: parseInfo(info),
      swarm: sw
    });
  });

  sw.on('reconnecting', (info) => {
    debug('Reconnecting:', parseInfo(info));

    emit('metric.swarm.reconnecting', {
      info: parseInfo(info),
      swarm: sw
    });
  });

  return sw;
};

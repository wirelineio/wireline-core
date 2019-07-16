//
// Copyright 2019 Wireline, Inc.
//

const discoverySwarmWebrtc = require('@geut/discovery-swarm-webrtc');
const debug = require('debug')('dsuite:swarm');

const { Protocol } = require('@wirelineio/megafeed2');
const { getDiscoveryKey } = require('@wirelineio/utils');

const Metric = require('../utils/metric');
const Config = require('../config');

const isBrowser = typeof window !== 'undefined';

/**
 * Creates the swarm.
 *
 * @param mega
 * @param conf
 * @return {*|DiscoverySwarmWebrtc}
 */
exports.createSwarm = (mega, conf) => {

  // TODO(burdon): Removing control feed.
  const id = mega.id.toString('hex');

  // TODO(burdon): Handle defaults externally (remove const here).
  // Priority: conf => ENV => default (SIGNALHUB const).
  const signalhub = conf.hub || process.env.SIGNALHUB || Config.SIGNALHUB;
  const ice = JSON.parse(conf.ice || process.env.ICE_SERVERS || Config.ICE_SERVERS);

  debug('Connecting:', JSON.stringify({ signalhub, ice }));
  debug('PeerId:', id);

  const swarm = conf.swarm || discoverySwarmWebrtc;

  const sw = swarm({
    id,

    urls: Array.isArray(signalhub) ? signalhub : [signalhub],

    // Maximum number of peer candidates requested from the signaling server (but can have multiple in-coming).
    maxPeers: conf.maxPeers || process.env.SWARM_MAX_PEERS || (conf.isBot ? 64 : 2),

    // TODO(burdon): Get's the main hypercore stream (not actually the feed replication stream).
    stream: (info) => {
      return new Protocol({
        streamOptions: {
          id,
          live: true
        }
      })
        .setExtensions(mega.createExtensions())
        .init(conf.partyKey)
        .stream;
      // TODO(martin): Should be dynamic using info.channel but for now static is fine.
      // .init(info.channel);
    },

    simplePeer: {
      // Node client (e.g., for bots).
      wrtc: !isBrowser ? require('wrtc') : null, // eslint-disable-line global-require
      config: {
        iceServers: ice
      }
    }
  });

  process.nextTick(() => sw.join(getDiscoveryKey(conf.partyKey)));

  return sw;
};

/**
 * Add event handlers for debugging.
 *
 * @param sw
 * @param mega
 * @param dsuite
 * @return {*|DiscoverySwarmWebrtc}
 */
// TODO(burdon): Event bubbling (rather than on dsuite object?)
exports.addSwarmHandlers = (sw, mega, dsuite) => {

  // TODO(burdon): 'swarm.peers' (different from connections).
  // sw.signal.info(data => console.log(data));

  // TODO(burdon): Removing control feed.
  const id = mega.id.toString('hex');

  if (!sw.signal) {
    return sw;
  }

  sw.on('connection', (peer, info) => {
    sw.signal.info({ type: 'connection', channel: info.channel, peers: [id, info.id] });

    debug('Connection open:', info.id);
    dsuite.emit('metric.swarm.connection-open', {
      value: sw.peers(info.channel).filter(peer => peer.connected).length,
      peer,
      info,
      swarm: sw
    });
  });

  sw.on('connection-closed', (peer, info) => {
    sw.signal.info({ type: 'disconnection', channel: info.channel, peers: [id, info.id] });

    debug('Connection closed:', info.id);
    dsuite.emit('metric.swarm.connection-closed', {
      value: sw.peers(info.channel).filter(peer => peer.connected).length,
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

    dsuite.emit('metric.swarm.connection-error', {
      err,
      info,
      swarm: sw
    });
  });

  sw.on('reconnecting', (info) => {
    debug('Reconnecting:', info);

    dsuite.emit('metric.swarm.reconnecting', {
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

    dsuite.emit('metric.swarm.network-updated', {
      value: new Metric(value, value => value.connections.length),
      info,
      swarm: sw
    });
  });

  return sw;
};

//
// Copyright 2019 Wireline, Inc.
//

const discoverySwarmWebrtc = require('@geut/discovery-swarm-webrtc');
const createDebug = require('debug');

const Metric = require('./utils/metric');
const Config = require('./config');

const debug = createDebug('dsuite:swarm');

const isBrowser = typeof window !== 'undefined';

/**
 * Subscribe to swarm network messages.
 *
 * @param dsuite kappa core.
 * @param conf {Object}
 * @param conf.isBot {Boolean}
 * @param conf.maxPeers {Number}
 * @param conf.hub {String|Array}
 */
module.exports = (dsuite, conf = {}) => {
  const { mega } = dsuite;
  const id = mega.feed('control').discoveryKey.toString('hex');

  // TODO(burdon): This function "hides" the main swarm constructor.
  // Move this outside and have adapater to add debug metrics.

  // TODO(burdon): Handle defaults externally (remove const here).
  // Priority: conf => ENV => default (SIGNALHUB const).
  const signalhub = conf.hub || process.env.SIGNALHUB || Config.SIGNALHUB;
  const ice = JSON.parse(conf.ice || process.env.ICE_SERVERS || Config.ICE_SERVERS);

  // TODO(burdon): This starts before the client has been initialized. Create init() method?
  const swarm = conf.swarm || discoverySwarmWebrtc;
  const sw = swarm({
    id,

    urls: Array.isArray(signalhub) ? signalhub : [signalhub],

    // Maximum number of peer candidates requested from the signaling server (but can have multiple in-coming).
    maxPeers: conf.maxPeers || process.env.SWARM_MAX_PEERS || (conf.isBot ? 64 : 2),

    // TODO(burdon): Get's the main hypercore stream (not actually the feed replication stream).
    stream: info => mega.replicate({ key: info.channel, live: true }),

    simplePeer: {
      // Node client (e.g., for bots).
      wrtc: !isBrowser ? require('wrtc') : null, // eslint-disable-line global-require
      config: {
        iceServers: ice
      }
    }
  });

  debug('Connecting:', JSON.stringify({ signalhub, ice }));
  debug('PeerId:', mega.id.toString('hex'));

  // TODO(burdon): 'swarm.peers' (different from connections).
  // sw.signal.info(data => console.log(data));

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

  mega.on('party', (party) => {
    const value = { key: party.key.toString('hex'), dk: party.discoveryKey.toString('hex') };

    sw.join(value.dk);

    dsuite.emit('metric.swarm.party', { value });
  });

  return sw;
};

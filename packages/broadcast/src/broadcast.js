import { EventEmitter } from 'events';
import crypto from 'crypto';
import Codec from '@wirelineio/codec-protobuf';
import createDebug from 'debug';

// eslint-disable-next-line
import schema from './schema.json';
import Scheduler from './scheduler';

createDebug.formatters.h = v => v.toString('hex').slice(0, 6);
const debug = createDebug('broadcast');

class Broadcast extends EventEmitter {
  constructor(opts = {}) {
    super();

    const { id, lookup, sender, receiver } = opts;
    console.assert(id);
    console.assert(lookup);
    console.assert(sender);
    console.assert(receiver);

    this._id = id;
    this._lookup = this._buildLookup(lookup);
    this._sender = (...args) => sender(...args);
    this._receiver = onMessage => receiver(onMessage);

    this._running = false;
    this._seenSeqs = new Map();
    this._seenSeqsNeighbors = new Map();
    this._peers = [];
    this._scheduler = new Scheduler();
    this._codec = new Codec({ verify: true });
    this._codec.loadFromJSON(schema);
  }

  async publish(data) {
    if (!this._running) {
      console.warn('Broadcast not running.');
      return;
    }

    const packet = { seq: crypto.randomBytes(32), data };
    await this._publish(packet);
  }

  run() {
    if (this._running) return;
    this._running = true;

    this._scheduler.addTask('prune-cache', async () => {
      const now = Date.now();
      this._seenSeqs.forEach((time, seq) => {
        if ((now - time) > 10 * 1000) {
          this._seenSeqs.delete(seq);
          this._seenSeqsNeighbors.delete(seq);
        }
      });
    }, 10 * 1000);

    this._cleanReceiver = this._receiver(packetEncoded => this._onPacket(packetEncoded));

    this._scheduler.startTask('prune-cache');
    debug('running %h', this._id);
  }

  stop() {
    if (!this._running) return;
    this._running = false;

    this._scheduler.deleteTask('prune-cache');
    this._cleanReceiver();
  }

  _buildLookup(lookup) {
    let looking = null;
    return async () => {
      try {
        if (!looking) {
          looking = lookup();
        }
        this._peers = await looking;
        looking = null;
        debug('lookup of %h', this._id, this._peers);
      } catch (err) {
        console.error(err);
        looking = null;
      }
    };
  }

  async _publish(packet) {
    this._seenSeqs.set(packet.seq.toString('hex'), Date.now());

    await this._lookup();

    const message = Object.assign({}, packet, { from: this._id });

    const packetEncoded = this._codec.encode({
      type: 'broadcast.Packet',
      message
    });

    const waitFor = this._peers.map((peer) => {
      if (this._checkSeenPacketBy(message.seq, peer.id)) return;

      debug('publish %h -> %h', this._id, peer.id, message);
      return this._sender(packetEncoded, peer);
    });

    return Promise.all(waitFor);
  }

  _onPacket(packetEncoded) {
    try {
      const { message: packet } = this._codec.decode(packetEncoded);

      this._addSeenPacketBy(packet.seq, packet.from);

      if (this._seenSeqs.has(packet.seq.toString('hex'))) return;

      const peer = this._peers.find(peer => peer.id.equals(packet.from));

      debug('received %h -> %h', this._id, packet.from, packet);

      this.emit('packet', packet, peer);

      this._publish(packet).catch(err => console.error(err));
    } catch (err) {
      console.error(err);
    }
  }

  _addSeenPacketBy(seq, id) {
    seq = seq.toString('hex');
    id = id.toString('hex');
    const peers = this._seenSeqsNeighbors.get(seq) || new Set();
    peers.add(id);
    this._seenSeqsNeighbors.set(seq, peers);
  }

  _checkSeenPacketBy(seq, id) {
    seq = seq.toString('hex');
    id = id.toString('hex');
    const peers = this._seenSeqsNeighbors.get(seq);
    return peers && peers.has(id);
  }
}

export default Broadcast;

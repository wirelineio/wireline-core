//
// Copyright 2019 Wireline, Inc.
//

const debug = require('debug')('metrics');
const util = require('util');

const isBrowser = typeof window !== 'undefined';
const Loggly = isBrowser ? require('loggly-jslogger').LogglyTracker : require('loggly');

const isTrue = (v) => {
  v = String(v).replace(/['"]/g, '');
  return v === 'true' || v === '1';
};

const createLogglyClient = () => {
  const remoteReporting = (isBrowser && localStorage.REMOTE_REPORTING) || process.env.REMOTE_REPORTING || false;
  const logglyKey = (isBrowser && localStorage.LOGGLY_KEY) || process.env.LOGGLY_KEY;

  let loggly = null;

  if (isTrue(remoteReporting) && logglyKey) {
    if (isBrowser) {
      loggly = new Loggly();
      loggly.push({ logglyKey });
    } else {
      // Emulate the browser-style API.
      loggly = new Loggly(logglyKey, { buffer: 1 });
      loggly.push = loggly.send;
    }
  }

  return loggly;
};

class Metrics {
  constructor(tag) {
    this._tag = tag;
    this._debug = tag ? debug.extend(tag) : debug;
    this._logglyClient = createLogglyClient();
  }

  get tag() {
    return this._tag;
  }

  event(name, context) {
    const type = 'EVENT';

    this._debug.extend(type)(name, context || '');
    this._loggly({ type, name, context });
  }

  message(message, ...args) {
    const type = 'MESSAGE';
    const formatted = util.format(message, ...args);

    this._debug.extend(type)(formatted);

    // If the message was an object, include it as context.
    const packet = { type, message: formatted };
    if (typeof message === 'object') {
      packet.context = message;
    }

    this._loggly(packet);
  }

  _loggly(packet) {
    if (!this._logglyClient) {
      return;
    }
    if (this.tag && !packet.tag) {
      packet.tag = this.tag;
    }
    if (packet.context && typeof packet.context !== 'object') {
      packet.context = { data: packet.context };
    }
    this._logglyClient.push(packet);
  }
}

module.exports = {
  Metrics
};

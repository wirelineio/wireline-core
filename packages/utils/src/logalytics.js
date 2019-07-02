//
// Copyright 2019 Wireline, Inc.
//

const _ = require('lodash');
const debug = require('debug');
const util = require('util');

const isBrowser = typeof window !== 'undefined';

const Loggly = isBrowser ? require('loggly-jslogger').LogglyTracker : require('loggly');

const envOrStorage = (key, def) => {
  return process.env[key] || (isBrowser && _.get(window, `localStorage['${key}']`)) || def;
};

class LogalyticsWriter {
  constructor(writeFn, opts = {}) {
    this._writeFn = writeFn;
    this._opts = opts;
  }

  get opts() {
    return this._opts;
  }

  write(name, type, timestamp, message) {
    this._writeFn(name, type, timestamp, message);
  }
}

class DebugWriter extends LogalyticsWriter {
  constructor(opts = {}) {
    // TODO(telackey): Will this create a mess of debug objects?
    const writeFn = (name, type, timestamp, message) => {
      debug(`logalytics:${type}:${name}`)(message);
    };
    super(writeFn, opts);
  }
}

class LogglyWriter extends LogalyticsWriter {
  constructor(logglyKey, logglyParams = {}, opts = {}) {
    if (!logglyKey) {
      throw new Error('logglyKey is required');
    }

    let writeFn;

    if (isBrowser) {
      logglyParams.logglyKey = logglyKey;
      const loggly = new Loggly();
      loggly.push(logglyParams);

      writeFn = (name, type, timestamp, message) => {
        loggly.push({ type, message, name, tag: name });
      };
    } else {
      logglyParams = _.defaults(logglyParams, { bufferSize: 20, flushInterval: 1000 });
      const loggly = new Loggly(logglyKey, logglyParams);

      writeFn = (name, type, timestamp, message) => {
        loggly.send({ type, message, name });
      };
    }

    super(writeFn, opts);
  }
}

const COUNTS = {};
class Logalytics {
  static _init() {
    if (Logalytics.__writers) {
      return;
    }

    // Always output via 'debug'.
    const writers = [new DebugWriter()];

    // Optionally do remote reporting.
    const remoteReporting = envOrStorage('REMOTE_REPORTING', false).toString() === 'true';
    const logglyKey = envOrStorage('LOGGLY_KEY');
    if (remoteReporting && logglyKey) {
      writers.push(new LogglyWriter(logglyKey));
    }

    Logalytics.__writers = writers;
  }

  static count(name, ...args) {
    if (!COUNTS[name]) {
      COUNTS[name] = 0;
    }
    COUNTS[name] += 1;

    Logalytics._send(name, 'COUNT', COUNTS[name], ...args);
  }

  static report(name, ...args) {
    Logalytics._send(name, 'REPORT', ...args);
  }

  static _send(name, type, ...args) {
    Logalytics._init();

    const formatted = util.format(...args);
    const timestamp = Date.now();
    Logalytics.__writers.forEach((writer) => {
      writer.write(name, type, timestamp, formatted);
    });
  }
}

module.exports = {
  Logalytics
};

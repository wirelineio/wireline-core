//
// Copyright 2019 Wireline, Inc.
//

const _ = require('lodash');
const debug = require('debug');
const util = require('util');

const isBrowser = typeof window !== 'undefined';

const Loggly = isBrowser ? require('loggly-jslogger').LogglyTracker : require('loggly');

const isTrue = (v) => {
  if (!v) {
    return false;
  }

  if (_.isInteger(v)) {
    return v !== 0;
  }

  return v.toString().replace(/['"]/g, '') === 'true';
};

class LogalyticsWriter {
  constructor(writeFn, opts = {}) {
    this._writeFn = writeFn;
    this._opts = opts;
  }

  get opts() {
    return this._opts;
  }

  write(name, type, timestamp, count, message) {
    this._writeFn(name, type, timestamp, count, message);
  }
}

class DebugWriter extends LogalyticsWriter {
  constructor(opts = {}) {
    // TODO(telackey): Will this create a mess of debug objects?
    const writeFn = (name, type, timestamp, count, message) => {
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

      writeFn = (name, type, timestamp, count, message) => {
        loggly.push({ type, message, name, count, tag: name });
      };
    } else {
      logglyParams = _.defaults(logglyParams, { bufferSize: 20, flushInterval: 1000 });
      const loggly = new Loggly(logglyKey, logglyParams);

      writeFn = (name, type, timestamp, count, message) => {
        loggly.send({ type, message, count, name });
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
    const remoteReporting = (isBrowser && localStorage.REMOTE_REPORTING) || process.env.REMOTE_REPORTING || false;
    const logglyKey = (isBrowser && localStorage.LOGGLY_KEY) || process.env.LOGGLY_KEY;
    if (isTrue(remoteReporting) && logglyKey) {
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
    Logalytics._send(name, 'REPORT', null, ...args);
  }

  static _send(name, type, count, ...args) {
    Logalytics._init();

    const formatted = util.format(...args);
    const timestamp = Date.now();
    Logalytics.__writers.forEach((writer) => {
      writer.write(name, type, timestamp, count, formatted);
    });
  }
}

module.exports = {
  Logalytics
};

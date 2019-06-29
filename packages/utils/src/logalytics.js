//
// Copyright 2019 Wireline, Inc.
//

const _ = require('lodash');
const debug = require('debug');
const util = require('util');

const __LOGGERS = {};
const isBrowser = typeof window !== 'undefined';

const Loggly = isBrowser ? require('loggly-jslogger').LogglyTracker : require('loggly');


const LogalyticsLevel = {
  PRINT: Number.MAX_SAFE_INTEGER,
  OFF: Number.MAX_SAFE_INTEGER - 1,
  FATAL: 32000,
  ERROR: 16000,
  WARN: 8000,
  INFO: 4000,
  DEBUG: 2000,
  TRACE: 1000,

  fromName: (name) => {
    name = name.toUpperCase();
    return LogalyticsLevel[name];
  },

  fromValue: (value) => {
    let ret = null;
    LogalyticsLevel.keys.forEach((key) => {
      const lv = LogalyticsLevel[key];
      if (!_.isFunction(lv)) {
        if (value === lv || value.toString() === lv.toString()) {
          ret = key;
        }
      }
    });
    return ret;
  },

  currentLevel: (name) => {
    let level = LogalyticsLevel.INFO;

    const def = process.env.LOGALYTICS || (isBrowser && _.get(window, 'localStorage.LOGALYTICS'));
    if (def) {
      level = LogalyticsLevel.fromName(def) || LogalyticsLevel.fromValue(def);
    }

    // TODO(telackey): check a per-name setting here
    if (name) {
      name += '';
    }

    return level || LogalyticsLevel.INFO;
  }
};

class LogalyticsWriter {
  constructor(writeFn, opts = {}) {
    this._writeFn = writeFn;

    const { min, max } = opts;
    this._min = min;
    this._max = max;
    this._opts = opts;
  }

  get minLevel() {
    return this._min;
  }

  get maxLevel() {
    return this._max;
  }

  get opts() {
    return this._opts;
  }

  write(name, level, timestamp, message) {
    this._writeFn(name, level, timestamp, message);
  }

  isEnabled(level) {
    if (!this.minLevel && !this.maxLevel) {
      return true;
    }
    let ret = true;

    if (this.minLevel && level < this.minLevel) {
      ret = false;
    }

    if (this.maxLevel && level > this.maxLevel) {
      ret = false;
    }
    return ret;
  }
}

class DebugWriter extends LogalyticsWriter {
  constructor(opts = {}) {
    // TODO(telackey): Will this create a mess of debug objects?
    const writeFn = (name, level, timestamp, message) => {
      debug(name)(message);
    };
    super(writeFn, opts);
  }
}

class ConsoleWriter extends LogalyticsWriter {
  constructor(opts = {}) {
    opts = _.defaults(opts, {
      showLevel: false,
      showTimestamp: false,
      showName: true,
      consoleFn: console.error,
    });

    const { consoleFn } = opts;

    const writeFn = (name, level, timestamp, message) => {
      const parts = [];
      if (opts.showTimestamp) {
        parts.push(timestamp);
      }
      if (opts.showLevel) {
        parts.push(LogalyticsLevel.fromValue(level));
      }
      if (opts.showName) {
        parts.push(name);
      }
      parts.push(message);
      consoleFn(...parts);
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

      writeFn = (name, level, timestamp, message) => {
        loggly.push({ level: LogalyticsLevel.fromValue(level), message, name, tag: name });
      };
    } else {
      logglyParams = _.defaults(logglyParams, { bufferSize: 20, flushInterval: 1000 });
      const loggly = new Loggly(logglyKey, logglyParams);

      writeFn = (name, level, timestamp, message) => {
        loggly.send({ level: LogalyticsLevel.fromValue(level), message, name });
      };
    }

    super(writeFn, opts);
  }
}


class LogalyticsLogger {
  constructor(name = 'logalytics') {
    this._name = name.toString();
    this._writers = [];
    this._counts = {};

    // default to using console.log < WARN, console.error >= WARN
    this.addWriter(new ConsoleWriter({ consoleFn: console.log, max: LogalyticsLevel.WARN }));
    this.addWriter(new ConsoleWriter({ consoleFn: console.error, min: LogalyticsLevel.WARN }));

    if (process.env.LOGGLY_KEY) {
      this.addWriter(new LogglyWriter(process.env.LOGGLY_KEY));
    }
  }

  _count(level) {
    if (!this._counts[level]) {
      this._counts[level] = 0;
    }

    this._counts[level] += 1;
  }

  get counts() {
    return this._counts;
  }

  addWriter(writer) {
    if (!_.isFunction(writer.write)) {
      writer = new LogalyticsWriter(writer);
    }
    this._writers.push(writer);
  }

  removeWriter(writer) {
    this._writers = this._writers.filter(value => value._write !== writer);
  }

  removeAllWriters() {
    this._writers = [];
  }

  trace(...args) {
    this.log(LogalyticsLevel.TRACE, ...args);
  }

  debug(...args) {
    this.log(LogalyticsLevel.DEBUG, ...args);
  }

  info(...args) {
    this.log(LogalyticsLevel.INFO, ...args);
  }

  warn(...args) {
    this.log(LogalyticsLevel.WARN, ...args);
  }

  error(...args) {
    this.log(LogalyticsLevel.ERROR, ...args);
  }

  fatal(...args) {
    this.log(LogalyticsLevel.FATAL, ...args);
  }

  print(...args) {
    this.log(LogalyticsLevel.PRINT, ...args);
  }

  log(level, ...args) {
    // Count regardless of whether or not we print.
    this._count(level);

    if (this.isEnabled(level)) {
      const formatted = util.format(...args);
      const timestamp = Date.now();
      this._writers.forEach((writer) => {
        if (writer.isEnabled(level)) {
          writer.write(this.name, level, timestamp, formatted);
        }
      });
    }
  }

  isEnabled(level) {
    return level >= LogalyticsLevel.currentLevel(this.name);
  }

  get name() {
    return this._name;
  }

  toString() {
    const counts = [];
    LogalyticsLevel.keys.forEach((key) => {
      if (!_.isFunction(LogalyticsLevel[key])) {
        const count = this._counts[LogalyticsLevel[key]] || 0;
        counts.push(`${key}: ${count}`);
      }
    });
    return `${this.name}: ${counts.join(', ')}`;
  }
}

class Logalytics {
  static currentLevel(name) {
    return LogalyticsLevel.currentLevel(name);
  }

  static get(name = 'logalytics') {
    if (_.isObject(name)) {
      name = _.get(name, 'name') || _.get(name, 'constructor.name') || name.toString();
    }
    if (!__LOGGERS[name]) {
      __LOGGERS[name] = new LogalyticsLogger(name);
    }
    return __LOGGERS[name];
  }

  static listenForUnhandled(writer = null, level = LogalyticsLevel.FATAL) {
    if (Logalytics._unhandledListenersAttached) {
      return;
    }

    const errLogger = Logalytics.get('UnhandledException');
    const rejLogger = Logalytics.get('UnhandledRejection');

    // Attach a special writer if we were given one.
    if (writer) {
      errLogger.addWriter(writer);
      rejLogger.addWriter(writer);
    }

    if (isBrowser) {
      window.onerror = (message, file, line, col, error) => {
        errLogger.log(level, message, file, line, col, error);
        return false;
      };
      window.addEventListener('error', (e) => {
        errLogger.log(level, e);
        return false;
      });
      window.addEventListener('unhandledrejection', (e) => {
        rejLogger.log(level, e);
        return false;
      });
    } else {
      process.on('unhandledException', (e) => {
        errLogger.log(level, e);
      });
      process.on('unhandledRejection', (reason, promise) => {
        rejLogger.log(level, reason, promise);
      });
    }

    Logalytics._unhandledListenersAttached = true;
  }

  static log(name, level, ...args) {
    const logger = Logalytics.get(name);
    logger.log(level, ...args);
  }

  static trace(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.TRACE, ...args);
  }

  static debug(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.DEBUG, ...args);
  }

  static info(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.INFO, ...args);
  }

  static warn(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.WARN, ...args);
  }

  static error(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.ERROR, ...args);
  }

  static fatal(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.FATAL, ...args);
  }

  static print(name, ...args) {
    Logalytics.log(name, LogalyticsLevel.PRINT, ...args);
  }
}

module.exports = {
  LogglyWriter,
  ConsoleWriter,
  DebugWriter,
  LogalyticsWriter,
  LogalyticsLevel,
  LogalyticsLogger,
  Logalytics
};

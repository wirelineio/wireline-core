//
// Copyright 2019 Wireline, Inc.
//

const _ = require('lodash');
const { Logalytics } = require('./logalytics');

const isBrowser = typeof window !== 'undefined';
let handlersAttached = false;

const logUnhandled = () => {
  if (handlersAttached) {
    return;
  }

  if (isBrowser) {
    const errReporter = (name, e) => {
      const message = _.get(e, 'reason.stack') || _.get(e, 'reason.message') || e.reason.toString();
      Logalytics.report(name, e.type, message);
      console.error(e);
    };

    window.addEventListener('error', _.partial(errReporter, 'browser:error'));
    window.addEventListener('unhandledrejection', _.partial(errReporter, 'browser:unhandledrejection'));
  } else {
    process.on('unhandledException', (e) => {
      Logalytics.report('node:unhandledException', e);
      console.error(e);
    });
    process.on('unhandledRejection', (reason, promise) => {
      Logalytics.report('node:unhandledRejection', reason, promise);
      console.error(reason, promise);
    });
  }

  handlersAttached = true;
};

module.exports = {
  logUnhandled
};

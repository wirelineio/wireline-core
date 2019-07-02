//
// Copyright 2019 Wireline, Inc.
//

const { Logalytics } = require('./logalytics');

const isBrowser = typeof window !== 'undefined';
let handlersAttached = false;

const logUnhandled = () => {
  if (handlersAttached) {
    return;
  }

  if (isBrowser) {
    window.onerror = (message, file, line, col, error) => {
      Logalytics.report('UnhandledException', message, file, line, col, error);
      console.error(message, file, line, col, error);
      return false;
    };
    window.addEventListener('error', (e) => {
      Logalytics.report('UnhandledException', e);
      console.error(e);
      return false;
    });
    window.addEventListener('unhandledrejection', (e) => {
      Logalytics.report('UnhandledRejection', e);
      console.error(e);
      return false;
    });
  } else {
    process.on('unhandledException', (e) => {
      Logalytics.report('UnhandledException', e);
      console.error(e);
    });
    process.on('unhandledRejection', (reason, promise) => {
      Logalytics.report('UnhandledRejection', reason, promise);
      console.error(reason, promise);
    });
  }

  handlersAttached = true;
};

module.exports = {
  logUnhandled
};

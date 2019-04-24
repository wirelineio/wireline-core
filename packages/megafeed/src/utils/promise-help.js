//
// Copyright 2019 Wireline, Inc.
//

exports.callbackPromise = function callbackPromise() {
  let callback;

  const promise = new Promise(function(resolve, reject) {
    callback = function callback(err, value) {
      if (err) reject(err);
      else resolve(value);
    };
  });

  callback.promise = promise;
  return callback;
};

exports.resolveCallback = function resolveCallback(promise, cb) {
  if (!promise.then) {
    promise = Promise.resolve();
  }

  return promise.then(result => cb(null, result)).catch(cb);
};

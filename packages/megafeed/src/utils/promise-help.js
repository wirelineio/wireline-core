//
// Copyright 2019 Wireline, Inc.
//

exports.callbackPromise = function callbackPromise() {
  let callback;

  const promise = new Promise(((resolve, reject) => {
    callback = (err, value) => {
      if (err) reject(err);
      else resolve(value);
    };
  }));

  callback.promise = promise;
  return callback;
};

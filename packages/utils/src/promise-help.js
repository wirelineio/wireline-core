//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): Remove
function callbackPromise() {
  let callback;

  const promise = new Promise(((resolve, reject) => {
    callback = (err, value) => {
      if (err) reject(err);
      else resolve(value);
    };
  }));

  callback.promise = promise;
  return callback;
}

module.exports.callbackPromise = callbackPromise;

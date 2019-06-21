//
// Copyright 2019 Wireline, Inc.
//

const pump = require('pump');
const through = require('through2');

const eachMsg = (reader, cb) => (
  new Promise((resolve, reject) => {
    pump(
      reader,
      through.obj((chunk, _, next) => {
        cb.call(this, chunk, next);
      }),
      (err) => {
        if (err) {
          return reject(err);
        }

        resolve(null);
      }
    );
  })
);

const streamToList = async (reader, filter) => {
  const list = [];

  await eachMsg(reader, (msg, next) => {
    if (filter) {
      const _next = (valid) => {
        if (valid) {
          list.push(msg);
        }
        next();
      };

      filter(msg, _next);
    } else {
      list.push(msg);
      next();
    }
  });

  return list;
};

module.exports = {
  eachMsg,
  streamToList
};

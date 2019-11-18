//
// Copyright 2019 Wireline, Inc.
//

import pump from 'pump';
import through from 'through2';

/**
 * Create list from iterator.
 * @param reader
 * @param filter
 * @return {Promise<[]>}
 */
// TODO(burdon): Remove from utils.
export const arrayFromStream = async (reader, filter) => {
  const list = [];

  const each = (reader, cb) => {
    return new Promise((resolve, reject) => {
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
    });
  };

  await each(reader, (msg, next) => {
    if (filter) {
      filter(msg, (valid) => {
        if (valid) {
          list.push(msg);
        }
        next();
      });
    } else {
      list.push(msg);
      next();
    }
  });

  return list;
};

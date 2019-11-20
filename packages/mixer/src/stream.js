//
// Copyright 2019 Wireline, Inc.
//

import pump from 'pump';
import through from 'through2';

// TODO(burdon): Factor out: hyper-util?

// https://www.freecodecamp.org/news/node-js-streams-everything-you-need-to-know-c9141306be93
// https://www.npmjs.com/package/pump (replaces pipe)
// https://github.com/rvagg/through2 (converts streams to objects)
// https://nodesource.com/blog/understanding-object-streams/

/**
 * Create list from iterator.
 * @param reader
 * @param [filter]
 * @return {Promise<[]>}
 */
export const arrayFromStream = async (reader, filter = undefined) => {
  const each = (reader, onMessage) => {
    return new Promise((resolve, reject) => {
      pump(
        reader,
        through.obj((chunk, _, next) => onMessage(chunk, next)),
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(null);
          }
        }
      );
    });
  };

  const list = [];

  await each(reader, (message, next) => {
    if (filter) {
      filter(message, (valid) => {
        if (valid) {
          list.push(message);
        }
        next();
      });
    } else {
      list.push(message);
      next();
    }
  });

  return list;
};

//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');
const hyperid = require('hyperid');
const timestamp = require('monotonic-timestamp');
const pify = require('pify');

const uuid = hyperid({ fixedLength: true });

exports.append = async (feed, author, message) => {
  assert(message.type, 'Message.type is required.');
  assert(message.data !== undefined, 'Message.data is required.');

  const msg = Object.assign(
    {},
    {
      id: uuid(),
      author: author.toString('hex'),
      timestamp: timestamp(),
      type: message.type,
      data: message.data
    },
    message.extension || {}
  );
  await pify(feed.append.bind(feed))(msg);

  return msg;
};

//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');
const hyperid = require('hyperid');
const timestamp = require('monotonic-timestamp');

const uuid = hyperid({ fixedLength: true });

exports.append = async (feed, message) => {
  assert(message.type, 'Message.type is required.');
  assert(message.data !== undefined, 'Message.data is required.');

  await feed.pAppend(
    Object.assign(
      {},
      {
        id: uuid(),
        author: feed.key.toString('hex'),
        timestamp: timestamp(),
        type: message.type,
        data: message.data
      },
      message.extension || {}
    )
  );
};

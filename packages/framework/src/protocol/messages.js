//
// Copyright 2019 Wireline, Inc.
//

const assert = require('assert');
const hyperid = require('hyperid');
const timestamp = require('monotonic-timestamp');
const pify = require('pify');

const uuid = hyperid({ fixedLength: true });

// TODO(burdon): appendMessage.
// TODO(burdon): Move to utils?
exports.append = async (feed, message) => {
  assert(message.type, 'Message.type is required.');
  assert(message.data !== undefined, 'Message.data is required.');

  // TODO(burdon): Remove pify methods.
  await pify(feed.append.bind(feed))(
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

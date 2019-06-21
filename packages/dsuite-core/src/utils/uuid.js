//
// Copyright 2019 Wireline, Inc.
//

const charwise = require('charwise');

// TODO(burdon): Remove.
// eslint-disable-next-line class-methods-use-this
function uuid(...args) {
  return args
    .filter(Boolean)
    .map(charwise.encode)
    .join('!');
}

module.exports.uuid = uuid;

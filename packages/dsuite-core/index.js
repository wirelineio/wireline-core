//
// Copyright 2019 Wireline, Inc.
//

const Framework = require('./src/framework');

// TODO(telackey): Replace with Gravity Probe.
require('@wirelineio/wire-inspect');

module.exports = {
  DSuite: Framework,  // TODO(burdon): Remove.
  Framework
};

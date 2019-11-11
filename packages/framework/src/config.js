//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): IMPORTANT: Env vars should only be used by the root app. Otherwise must set in the function config.
module.exports = {
  WIRE_SIGNAL_ENDPOINT: 'https://signal.wireline.ninja',
  WIRE_ICE_ENDPOINTS: '[ { "urls": "stun:stun.wireline.ninja:3478" } ]'
};

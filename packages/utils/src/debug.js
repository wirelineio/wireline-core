//
// Copyright 2019 Wireline, Inc.
//

const chance = require('chance');

exports.random = chance(1);

exports.times = (num, cb) => Array.from({ length: num }, cb);

exports.latch = (n, callback) => () => { if (--n === 0) callback(n); };

//
// Copyright 2019 Wireline, Inc.
//

import chance from 'chance';

export const random = chance(1);

export const times = (num, cb) => Array.from({ length: num }, cb);

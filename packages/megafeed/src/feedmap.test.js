//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import { FeedMap } from './feedmap';

const log = debug('test');
debug.enable('test,feedmap');

test('basic FeedMap', (done) => {

  try {
    const feedmap = new FeedMap();
    log(String(feedmap));
  } catch (ex) {
    done();
  }
});

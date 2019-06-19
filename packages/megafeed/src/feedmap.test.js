//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';

import FeedMap from './feedmap';

// TODO(burdon): How to do errors?
const log = debug('test');
debug.enable('test,feedmap');

test('basic FeedMap', (done) => {

  try {
    const feedmap = new FeedMap();
    log(String(feedmap));
  } catch (ex) {
    log(ex);
    done();
  }
});

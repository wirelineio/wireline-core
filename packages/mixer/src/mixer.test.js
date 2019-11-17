//
// Copyright 2019 Wireline, Inc.
//

import { TypeFactory } from '@wirelineio/protobuf';

import { Mixer } from './mixer';

const typeFactory = new TypeFactory().parse(require('./schema.json'));

test('construction', () => {
  const mixer = new Mixer(typeFactory);

  // TODO(burdon): Create kappa view and connect to FeedStore.
  // TODO(burdon): Write messages.

  expect(mixer).not.toBeNull();
});

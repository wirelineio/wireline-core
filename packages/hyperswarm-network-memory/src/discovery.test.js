//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'crypto';
import { Discovery } from './discovery';

test('lookup and create a connection between two peers', (done) => {
  function _done() {
    _done.times -= 1;
    if (_done.times === 0) {
      done();
    }
  }
  _done.times = 2;

  expect.assertions(4);

  const discovery = new Discovery();

  const peerOne = crypto.randomBytes(6).toString('hex');
  const peerTwo = crypto.randomBytes(6).toString('hex');
  const topic = Buffer.from('topicOne');

  discovery.lookup({ peerId: peerOne, topic }, (connection, details) => {
    expect(typeof connection.pipe).toBe('function');
    expect(details.id).toBe(peerTwo);
    _done();
  });

  discovery.lookup({ peerId: peerTwo, topic }, (connection, details) => {
    expect(typeof connection.pipe).toBe('function');
    expect(details.id).toBe(peerOne);
    _done();
  });
});

test('leave from a topic', () => {
  const discovery = new Discovery();

  const peerId = crypto.randomBytes(6).toString('hex');
  const topic = Buffer.from('topicTwo');

  discovery.lookup({ peerId, topic }, () => {});

  expect(discovery._peersByTopic.get(topic.toString('hex')).get(peerId)).toBeTruthy();

  discovery.leave({ peerId, topic });

  expect(discovery._peersByTopic.get(topic.toString('hex')).get(peerId)).toBeFalsy();
});

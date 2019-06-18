//
// Copyright 2019 Wireline, Inc.
//

import Network from './network';

test('join to a topic and establish a connection', (done) => {
  const peerOne = new Network();
  const peerTwo = new Network();
  const topic = Buffer.from('topicOne');

  peerOne.join(topic);

  peerTwo.join(topic);

  peerOne.on('connection', (connection, details) => {
    expect(details.id).toBe(peerTwo._id);
    done();
  });
});

test('leave from a topic and close the connections', (done) => {
  const peerOne = new Network();
  const peerTwo = new Network();
  const topic = Buffer.from('topicTwo');

  peerOne.join(topic);

  peerTwo.join(topic);

  peerOne.on('connection', () => {
    peerOne.leave(topic);
  });

  peerOne.on('disconnection', (connection, details) => {
    expect(details.id).toBe(peerTwo._id);
    expect(peerOne._connections.size).toBe(0);
    done();
  });
});

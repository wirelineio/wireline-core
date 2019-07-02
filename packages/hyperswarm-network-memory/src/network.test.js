//
// Copyright 2019 Wireline, Inc.
//

import Network from './network';

test('join to a topic and establish a connection', (done) => {
  expect.assertions(1);

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
  expect.assertions(3);

  const peerOne = new Network();
  const peerTwo = new Network();
  const topic = Buffer.from('topicTwo');

  peerOne.join(topic);

  peerTwo.join(topic);

  peerOne.on('connection', (conn) => {
    conn.on('data', (buffer) => {
      expect(buffer.toString()).toBe('hi');
      peerOne.leave(topic);
    });
    conn.push('hi');
  });


  peerOne.on('disconnection', (connection, details) => {
    expect(details.id).toBe(peerTwo._id);
    expect(peerOne._connections.size).toBe(0);
    done();
  });
});

import { Network } from './network';

test('join to a topic and establish a connection', (done) => {
  const peerOne = new Network();
  const peerTwo = new Network();
  const topic = Buffer.from('topicOne');

  peerOne.join(topic);

  peerTwo.join(topic);

  peerOne.on('connection', (connection, details) => {
    expect(details.peer.id).toBe(peerTwo.id);
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
    expect(details.peer.id).toBe(peerTwo.id);
    expect(peerOne.connections.size).toBe(0);
    done();
  });
});

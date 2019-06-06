const crypto = require('crypto');
const pump = require('pump');

const Party = require('./party');

test('party handshake', (done) => {
  const partyKey = crypto.randomBytes(32);

  const peerOne = new Party({
    key: partyKey,
    rules: {
      findFeed() {},
      handshake: async () => {
        done();
      }
    }
  });

  const peerTwo = new Party({
    key: partyKey,
    rules: {
      findFeed() {},
      handshake: async () => {}
    }
  });

  const r1 = peerOne.replicate({ expectedFeeds: 1 });
  const r2 = peerTwo.replicate({ expectedFeeds: 1 });

  pump(r1, r2, r1);
});

const hypercore = require('hypercore');
const ram = require('random-access-memory');
const crypto = require('crypto');
const pump = require('pump');

const Party = require('./party');

test('party handshake', (done) => {
  const partyKey = crypto.randomBytes(32);

  const writer = hypercore(ram);

  writer.ready(() => {
    const reader = hypercore(ram, writer.key);

    const peerOne = new Party({
      key: partyKey,
      findFeed() {
        return writer;
      },
      rules: {
        handshake: async () => {
          done();
        }
      }
    });

    const peerTwo = new Party({
      key: partyKey,
      findFeed() {
        return reader;
      },
      rules: {
        handshake: async () => {}
      }
    });

    const r1 = peerOne.replicate({ expectedFeeds: 1 });
    const r2 = peerTwo.replicate({ expectedFeeds: 1 });

    pump(r1, r2, r1, (err) => {
      console.log(err);
    });
  });

});

//
// Copyright 2019 Wireline, Inc.
//

// TODO(burdon): What does this file do? Why isn't it a test?

const swarm = require('discovery-swarm');
const ram = require('random-access-memory');

const { Megafeed } = require('.');

const mega = new Megafeed(ram, {
  valueEncoding: 'json',
  feeds: [{ name: 'control' }]
});

mega.ready(async () => {
  const controlFeed = mega.feed('control');

  console.log(`control feed: ${controlFeed.key.toString('hex')}`);
  console.log(`control feed dk: ${controlFeed.discoveryKey.toString('hex')}`);

  setInterval(() => {
    controlFeed.append(`hola from ${controlFeed.key.toString('hex')}`);
  }, 2000);

  mega.on('append', feed => {
    if (feed === controlFeed) {
      return;
    }

    feed.head(console.log);
  });

  mega.setRules({
    name: 'dsuite:control',
    replicateOptions: {
      live: true
    },
    async handshake({ peer }) {
      const opts = Object.assign({}, this.replicateOptions, { stream: peer.stream });

      controlFeed.replicate(opts);

      peer.updateFeeds({
        putFeeds: [controlFeed.key]
      });
    },
    async remoteUpdateFeeds({ message, peer }) {
      const opts = Object.assign({}, this.replicateOptions, { stream: peer.stream });

      const feeds = await Promise.all(message.putFeeds.map(key => mega.addFeed({ key })));
      feeds.forEach(feed => feed.replicate(opts));
    }
  });

  const sw = swarm({
    stream(info) {
      return mega.replicate(info.channel, { live: true });
    }
  });

  let partyKey;
  if (process.argv[2]) {
    partyKey = process.argv[2];
  } else {
    partyKey = 'ebff0ba3341ef6151d629023a3b9a2f7d45c2f85f0ee1c63e769dc8c73e90ba2';
  }

  await mega.setParty({
    name: 'control',
    key: partyKey,
    rules: 'dsuite:control'
  });

  sw.listen();

  const dk = Megafeed.discoveryKey(partyKey);

  sw.join(dk);

  console.log('discovery: ', dk.toString('hex'));
  console.log('party key: ', partyKey.toString('hex'));

  //mega.on('peer-add', () => {
  //console.log('peer-added');
  //});

  //mega.on('peer-remove', () => {
  //console.log('peer-remove');
  //});
});



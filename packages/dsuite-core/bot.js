//
// Copyright 2019 Wireline, Inc.
//

const { DSuite } = require('.');

// TODO(burdon): This seems like a hack. Why is this here? (i.e., should be defined where it is used).

(async () => {
  const dsuite = new DSuite({ hub: 'https://signal.wireline.ninja', isBot: true, name: 'test-bot' });
  await dsuite.initialize();

  console.log(`Bot PK: ${await dsuite.api['contacts'].key()}`);
  dsuite.mega.on('append', (feed) => {
    feed.head(console.log);
  });
})();

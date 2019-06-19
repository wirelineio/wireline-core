const ram = require('random-access-memory');
const hypertrie = require('hypertrie');

const FeedMap = require('./feed-map');

describe('config FeedMap', () => {
  test('example test', async () => {
    const db = hypertrie(ram);

    const feedMap = new FeedMap(db, ram);

    const feed = await feedMap.addFeed({ name: 'local' });

    // Check the length.
    expect(feedMap.feeds().length).toBe(1);

    // Check finding a feed by name.
    expect(feedMap.feed('local')).toBe(feed);
  });
});

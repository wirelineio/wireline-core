//
// Copyright 2019 Wireline, Inc.
//

/**
 * Multifeed adapter factory for Megafeed based on topic.
 * @param {Megafeed} megafeed
 * @param {string} topic
 * @returns {Promise<{ready, feeds: (function(): [Feed]), on}>}
 */
export const createMultifeed = async (megafeed, topic) => {
  console.assert(megafeed);
  console.assert(topic);

  const feeds = await megafeed.loadFeeds(descriptor => {
    return descriptor.stat.metadata.topic === topic;
  });

  // Dispatch `feed` event to kappa.
  const onFeedListeners = new Map();
  megafeed.on('feed', (feed, stat) => {
    feeds.push(feed);

    const handler = onFeedListeners.get(stat.metadata.topic);
    if (handler) {
      handler(feed);
    }
  });

  // API required by multifeed-index (https://github.com/kappa-db/multifeed-index).
  return {
    on: (event, handler) => {
      console.assert(event === 'feed');
      onFeedListeners.set(topic, handler);
    },

    ready: cb => cb(),

    // Called when kappa is initialized.
    feeds: () => feeds
  }
};

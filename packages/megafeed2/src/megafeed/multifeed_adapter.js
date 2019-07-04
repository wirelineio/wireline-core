//
// Copyright 2019 Wireline, Inc.
//

/**
 * Multifeed adapter factory for FeedStore based on topic.
 * @param {FeedStore} feedStore
 * @param {string} topic
 * @returns {Promise<{ready, feeds: (function(): [Feed]), on}>}
 */
export const createMultifeedAdapter = async (feedStore, topic) => {
  console.assert(feedStore);
  console.assert(topic);

  const feeds = await feedStore.loadFeeds(descriptor => {
    return descriptor.stat.metadata.topic === topic;
  });

  // Dispatch `feed` event to kappa.
  const onFeedListeners = new Map();
  feedStore.on('feed', (feed, stat) => {
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

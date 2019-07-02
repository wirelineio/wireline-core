//
// Copyright 2019 Wireline, Inc.
//

import pify from 'pify';

import { random } from './debug';
import { keyName, keyMeta } from './keys';

export const feedMeta = feed => {
  const { key, writable, length } = feed;
  const downloaded = feed.downloaded(0, feed.length);

  return Object.assign(keyMeta(key), { writable, downloaded, length });
};

export const appendFeed = async (feed) => {
  return await pify(feed.append.bind(feed))(JSON.stringify(createMessage()));
};

export const createMessage = () => {
  const ts = Date.now();
  const data = {
    message: random.sentence({ words: random.integer({ min: 3, max: 8 }) })
  };

  return { ts, data };
};

export const messageList = (messages) => {
  return {
    messages: messages.map(({ key, block }, i) => ({
      order: i,
      key: keyName(key),
      block
    }))
  };
};

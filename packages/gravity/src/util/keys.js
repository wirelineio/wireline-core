//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import HumanHasher from 'humanhash';

export const hasher = new HumanHasher();

export const keyStr = key => key.toString('hex');

export const keyName = (key, prefix) => {
  const name = hasher.humanize(key.toString('hex'));
  if (prefix) {
    return `${prefix}(${name})`;
  }

  return name;
};

export const keyMeta = key => {
  return {
    key: keyStr(key),
    name: keyName(key)
  };
};

export const discoveryKey = key => crypto.discoveryKey(key);

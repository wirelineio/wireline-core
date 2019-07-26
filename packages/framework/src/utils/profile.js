//
// Copyright 2019 Wireline, Inc.
//

const { keyToHex } = require('@wirelineio/utils');

const path = key => `framework/${keyToHex(key)}/profile`;

exports.setProfile = (key, msg) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(path(key), JSON.stringify(msg));
  }
  return null;

};

exports.getProfile = (key) => {
  if (typeof localStorage !== 'undefined') {
    try {
      return JSON.parse(localStorage.getItem(path(key)));
    } catch (err) {
      // do nothing
    }
  }

  return null;
};

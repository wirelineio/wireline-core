//
// Copyright 2019 Wireline, Inc.
//

const { keyToHex } = require('@wirelineio/utils');

const path = key => `framework/${keyToHex(key)}/profile`;

let profile = null;

exports.setProfile = (key, msg) => {
  profile = JSON.stringify(msg);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(path(key), profile);
  }
};

exports.getProfile = (key) => {
  let local = profile;
  if (typeof localStorage !== 'undefined') {
    local = localStorage.getItem(path(key));
  }
  try {
    return JSON.parse(local);
  } catch (err) {
    // do nothing
  }
  return null;
};

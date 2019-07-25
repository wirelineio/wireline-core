//
// Copyright 2019 Wireline, Inc.
//

const { keyToHex } = require('@wirelineio/utils');

const path = key => `framework/${keyToHex(key)}/profile`;

exports.setProfile = (key, msg) => {
  if (!localStorage) {
    return null;
  }

  localStorage.setItem(path(key), JSON.stringify(msg));
};

exports.getProfile = (key) => {
  if (!localStorage) {
    return null;
  }

  try {
    return JSON.parse(localStorage.getItem(path(key)));
  } catch (err) {
    return null;
  }
};

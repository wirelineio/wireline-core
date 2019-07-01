//
// Copyright 2019 Wireline, Inc.
//

exports.levelHas = async function levelHas(lvl, key) {
  try {
    return await lvl.get(key);
  } catch (err) {
    if (!err.notFound) {
      throw err;
    }
  }

  return false;
};

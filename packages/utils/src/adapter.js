//
// Copyright 2019 Wireline, Inc.
//

/**
 * Returns an object that has accessors for named functions and properties.
 * @param {Object} root - target object
 * @param {[{stirng}]} properties - named set of properties
 * @returns {Object} adapter object
 */
function adapter(root, properties) {
  return properties.reduce((current, property) => {
    if (root[property] instanceof Function) {
      current[property] = (...args) => { return root[property](args); };
    } else {
      current[property] = () => { return root[property]; };
    }

    return current;
  }, {});
}

module.exports = { adapter };

//
// Copyright 2019 Wireline, Inc.
//

/**
 * Builds a tree by parentId.
 * @param {array} items
 * @param {string} parentField
 */
const makeTree = (items, parentField) => {
  const tree = {};
  items.forEach((item) => {
    if (!tree[item[parentField]]) {
      tree[item[parentField]] = [];
    }
    tree[item[parentField]].push(item);
  });

  return tree;
};

/**
 * Hierarchical sort for the logs.
 * @param {object} tree
 * @param {string} id
 * @param {function} comparator
 * @param {function} result
 */
const hierarchicalSort = (tree, id, comparator, result) => {
  const children = tree[id];
  if (children) {
    children.sort(comparator).forEach((item) => {
      result.push(item);
      hierarchicalSort(tree, item.id, comparator, result);
    });
  }

  return result;
};

/**
 * Log view.
 * @returns {{api: { logs: (function(): Array) }, map}}
 * @constructor
 */
export const OrderedLogView = (type) => {
  let logsByType = [];

  return {
    map: (entries, next) => {
      entries.forEach(entry => {
        if (entry.value.type === type) {
          logsByType.push(entry.value);
        }
      });
      next();
    },

    api: {
      logs: () => {
        return logsByType;
      },

      logsByItemId: (core, itemId, { parentField, sortField, rootParent }) => {
        // TODO(ashwin): View should create index.
        // TODO(egorgripasov): Proper sort inside kappa.
        const logs = logsByType.filter(item => item.itemId === itemId);
        const sort = (a, b) => a[sortField].localeCompare(b[sortField]);
        return hierarchicalSort(makeTree(logs, parentField), rootParent, sort, []);
      }
    }
  }
};

/**
 * Log app.
 */
export class OrderedLogApp {

  constructor(view, itemId) {
    console.assert(view);
    console.assert(itemId);

    this._view = view;
    this._itemId = itemId;
  }

  list(options) {
    return this._view.logsByItemId(this._itemId, options);
  }
}

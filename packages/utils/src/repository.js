//
// Copyright 2019 Wireline, Inc.
//

module.exports = function createStorage(root, namespace) {
  const pPut = pify(root.put.bind(root));
  const pGet = pify(root.get.bind(root));
  const pDel = pify(root.del.bind(root));
  const pList = pify(root.list.bind(root));

  return {
    getList: async ({ codec }) => {
      const list = await pList(`${namespace}/`);
      return list.map(({ value }) => codec.decode(value));
    },
    get: (key, { codec }) => pGet(`${namespace}/${keyToHex(key)}`, { valueEncoding: codec }),
    put: (key, value, { encode }) => pPut(`${namespace}/${keyToHex(key)}`, encode(value)),
    del: key => pDel(`${namespace}/${keyToHex(key)}`)
  };
};

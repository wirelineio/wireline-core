//
// Copyright 2019 Wireline, Inc.
//

import protobufjs from 'protobufjs';

import Codec from '@wirelineio/codec-protobuf';

/**
 * Create codec from .proto files.
 * @param {[string]} paths
 * @returns {Promise<Codec>}
 */
export const createCodec = async (paths) => {
  const codec = new Codec({ verify: true });
  for (let i = 0; i < paths.length; i++) {
    codec.load(await protobufjs.load(paths[i]));
  }

  return codec;
};

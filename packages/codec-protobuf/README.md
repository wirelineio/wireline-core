# Protobuf Codec

Protobuf encoder/decoder that follows the hypercore codec API (https://github.com/Level/codec).

Handles messages that contain nested `google.protobuf.Any` types.

NOTE: This module currently uses a [forked](https://github.com/wirelineio/protobuf.js#wireline-dist) version 
of `protobufjs` since the original does not support `Buffer` objects that work in the browser.


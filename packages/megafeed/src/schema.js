// This file is auto generated by the protocol-buffers compiler

/* eslint-disable quotes */
/* eslint-disable indent */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */

// Remember to `npm install --save protocol-buffers-encodings`
var encodings = require('protocol-buffers-encodings')
var varint = encodings.varint
var skip = encodings.skip

var Feed = exports.Feed = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

defineFeed()

function defineFeed () {
  var enc = [
    encodings.string,
    encodings.bytes,
    encodings.bool
  ]

  Feed.encodingLength = encodingLength
  Feed.encode = encode
  Feed.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.path)) throw new Error("path is required")
    var len = enc[0].encodingLength(obj.path)
    length += 1 + len
    if (!defined(obj.key)) throw new Error("key is required")
    var len = enc[1].encodingLength(obj.key)
    length += 1 + len
    if (defined(obj.secretKey)) {
      var len = enc[1].encodingLength(obj.secretKey)
      length += 1 + len
    }
    if (defined(obj.load)) {
      var len = enc[2].encodingLength(obj.load)
      length += 1 + len
    }
    if (defined(obj.valueEncoding)) {
      var len = enc[0].encodingLength(obj.valueEncoding)
      length += 1 + len
    }
    if (defined(obj.metadata)) {
      var len = enc[1].encodingLength(obj.metadata)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.path)) throw new Error("path is required")
    buf[offset++] = 10
    enc[0].encode(obj.path, buf, offset)
    offset += enc[0].encode.bytes
    if (!defined(obj.key)) throw new Error("key is required")
    buf[offset++] = 18
    enc[1].encode(obj.key, buf, offset)
    offset += enc[1].encode.bytes
    if (defined(obj.secretKey)) {
      buf[offset++] = 26
      enc[1].encode(obj.secretKey, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.load)) {
      buf[offset++] = 32
      enc[2].encode(obj.load, buf, offset)
      offset += enc[2].encode.bytes
    }
    if (defined(obj.valueEncoding)) {
      buf[offset++] = 42
      enc[0].encode(obj.valueEncoding, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.metadata)) {
      buf[offset++] = 50
      enc[1].encode(obj.metadata, buf, offset)
      offset += enc[1].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      path: "",
      key: null,
      secretKey: null,
      load: false,
      valueEncoding: "",
      metadata: null
    }
    var found0 = false
    var found1 = false
    while (true) {
      if (end <= offset) {
        if (!found0 || !found1) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.path = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.key = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        found1 = true
        break
        case 3:
        obj.secretKey = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 4:
        obj.load = enc[2].decode(buf, offset)
        offset += enc[2].decode.bytes
        break
        case 5:
        obj.valueEncoding = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 6:
        obj.metadata = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defined (val) {
  return val !== null && val !== undefined && (typeof val !== 'number' || !isNaN(val))
}

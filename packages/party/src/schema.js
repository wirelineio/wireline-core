// This file is auto generated by the protocol-buffers compiler

/* eslint-disable quotes */
/* eslint-disable indent */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */

// Remember to `npm install --save protocol-buffers-encodings`
var encodings = require('protocol-buffers-encodings')
var varint = encodings.varint
var skip = encodings.skip

var Party = exports.Party = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Transaction = exports.Transaction = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var IntroduceFeeds = exports.IntroduceFeeds = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Request = exports.Request = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var EphemeralMessage = exports.EphemeralMessage = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

defineParty()
defineTransaction()
defineIntroduceFeeds()
defineRequest()
defineEphemeralMessage()

function defineParty () {
  var enc = [
    encodings.string,
    encodings.bytes
  ]

  Party.encodingLength = encodingLength
  Party.encode = encode
  Party.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.name)) throw new Error("name is required")
    var len = enc[0].encodingLength(obj.name)
    length += 1 + len
    if (!defined(obj.key)) throw new Error("key is required")
    var len = enc[1].encodingLength(obj.key)
    length += 1 + len
    if (defined(obj.secretKey)) {
      var len = enc[1].encodingLength(obj.secretKey)
      length += 1 + len
    }
    if (defined(obj.rules)) {
      var len = enc[0].encodingLength(obj.rules)
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
    if (!defined(obj.name)) throw new Error("name is required")
    buf[offset++] = 10
    enc[0].encode(obj.name, buf, offset)
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
    if (defined(obj.rules)) {
      buf[offset++] = 34
      enc[0].encode(obj.rules, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.metadata)) {
      buf[offset++] = 42
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
      name: "",
      key: null,
      secretKey: null,
      rules: "",
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
        obj.name = enc[0].decode(buf, offset)
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
        obj.rules = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 5:
        obj.metadata = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineTransaction () {
  var enc = [
    encodings.string,
    encodings.bool
  ]

  Transaction.encodingLength = encodingLength
  Transaction.encode = encode
  Transaction.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.id)) throw new Error("id is required")
    var len = enc[0].encodingLength(obj.id)
    length += 1 + len
    if (defined(obj.return)) {
      var len = enc[1].encodingLength(obj.return)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.id)) throw new Error("id is required")
    buf[offset++] = 10
    enc[0].encode(obj.id, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.return)) {
      buf[offset++] = 16
      enc[1].encode(obj.return, buf, offset)
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
      id: "",
      return: false
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.id = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.return = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineIntroduceFeeds () {
  var enc = [
    Transaction,
    encodings.bytes
  ]

  IntroduceFeeds.encodingLength = encodingLength
  IntroduceFeeds.encode = encode
  IntroduceFeeds.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.transaction)) throw new Error("transaction is required")
    var len = enc[0].encodingLength(obj.transaction)
    length += varint.encodingLength(len)
    length += 1 + len
    if (defined(obj.keys)) {
      for (var i = 0; i < obj.keys.length; i++) {
        if (!defined(obj.keys[i])) continue
        var len = enc[1].encodingLength(obj.keys[i])
        length += 1 + len
      }
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.transaction)) throw new Error("transaction is required")
    buf[offset++] = 10
    varint.encode(enc[0].encodingLength(obj.transaction), buf, offset)
    offset += varint.encode.bytes
    enc[0].encode(obj.transaction, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.keys)) {
      for (var i = 0; i < obj.keys.length; i++) {
        if (!defined(obj.keys[i])) continue
        buf[offset++] = 18
        enc[1].encode(obj.keys[i], buf, offset)
        offset += enc[1].encode.bytes
      }
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
      transaction: null,
      keys: []
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        var len = varint.decode(buf, offset)
        offset += varint.decode.bytes
        obj.transaction = enc[0].decode(buf, offset, offset + len)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.keys.push(enc[1].decode(buf, offset))
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineRequest () {
  var enc = [
    Transaction,
    encodings.string,
    encodings.bytes
  ]

  Request.encodingLength = encodingLength
  Request.encode = encode
  Request.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.transaction)) throw new Error("transaction is required")
    var len = enc[0].encodingLength(obj.transaction)
    length += varint.encodingLength(len)
    length += 1 + len
    if (defined(obj.type)) {
      var len = enc[1].encodingLength(obj.type)
      length += 1 + len
    }
    if (defined(obj.value)) {
      var len = enc[2].encodingLength(obj.value)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.transaction)) throw new Error("transaction is required")
    buf[offset++] = 10
    varint.encode(enc[0].encodingLength(obj.transaction), buf, offset)
    offset += varint.encode.bytes
    enc[0].encode(obj.transaction, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.type)) {
      buf[offset++] = 26
      enc[1].encode(obj.type, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.value)) {
      buf[offset++] = 34
      enc[2].encode(obj.value, buf, offset)
      offset += enc[2].encode.bytes
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
      transaction: null,
      type: "",
      value: null
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        var len = varint.decode(buf, offset)
        offset += varint.decode.bytes
        obj.transaction = enc[0].decode(buf, offset, offset + len)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 3:
        obj.type = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 4:
        obj.value = enc[2].decode(buf, offset)
        offset += enc[2].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineEphemeralMessage () {
  var enc = [
    encodings.string,
    encodings.bytes
  ]

  EphemeralMessage.encodingLength = encodingLength
  EphemeralMessage.encode = encode
  EphemeralMessage.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (defined(obj.type)) {
      var len = enc[0].encodingLength(obj.type)
      length += 1 + len
    }
    if (defined(obj.value)) {
      var len = enc[1].encodingLength(obj.value)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (defined(obj.type)) {
      buf[offset++] = 10
      enc[0].encode(obj.type, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.value)) {
      buf[offset++] = 18
      enc[1].encode(obj.value, buf, offset)
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
      type: "",
      value: null
    }
    while (true) {
      if (end <= offset) {
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.type = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 2:
        obj.value = enc[1].decode(buf, offset)
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

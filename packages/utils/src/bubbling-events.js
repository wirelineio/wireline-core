//
// Copyright 2019 Wireline, Inc.
//

module.exports = function bubblingEvents(target, emitter, events = []) {
  events.forEach(event => emitter.on(event, (...args) => target.emit(event, ...args)));
};

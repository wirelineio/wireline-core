module.exports = function bubblingEvents(target, emitter, events = []) {
  events.forEach(event => emitter.on(event, (...args) => target.emit(event, ...args)));
};

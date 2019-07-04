//
// Copyright 2019 Wireline, Inc.
//

const { adapter } = require('./adapter');

class Private {

  constructor() {
    this._foo = 100;
  }

  get foo() {
    return this._foo;
  }

  bar(x) {
    return this._foo * x;
  }

  foobar() {
    return !!this._foo;
  }
}

test('adapter', (done) => {

  const obj = new Private();

  /**
   * @type {foo, bar}
   * @property {Function} foo
   * @property {Function} bar
   */
  const proxy = adapter(obj, ['foo', 'bar']);

  // function.
  expect(proxy.foo()).toBe(obj.foo);

  // getter.
  expect(proxy.bar(8)).toBe(obj.bar(8));

  try {
    // can't access.
    proxy.foobar();
  } catch (ex) {
    done();
  }
});

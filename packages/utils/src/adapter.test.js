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
    return 2 * x;
  }

  foobar() {
    return false;
  }
}

test('adapter', (done) => {

  const obj = new Private();

  const proxy = adapter(obj, ['foo', 'bar']);

  expect(proxy.foo()).toBe(obj.foo);
  expect(proxy.bar(8)).toBe(obj.bar(8));

  try {
    proxy.foobar();
  } catch (ex) {
    done();
  }
});

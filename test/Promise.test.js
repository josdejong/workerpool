const assert = require('assert');
const Promise = require('../lib/Promise');

describe('Promise', function() {
  describe('construction', function() {
    it('should throw an error when constructed without handler', function() {
      assert.throws(function() { new Promise(); }, SyntaxError);
    });

    it('should construct a promise with handler and resolve it', function(done) {
      new Promise((resolve, reject) => {
        resolve(2)
      }).then((result) => {
        assert.equal(result, 2);

        done();
      });
    });

    it('should construct a promise with handler and reject it', function(done) {
      new Promise((resolve, reject) => {
        reject(2)
      }).catch((error) => {
        assert.equal(error, 2);

        done();
      });
    });

    it('should throw an error when constructed without new keyword', function() {
      assert.throws(function () { Promise() }, /Error/);
    });
  });

  describe('then', function() {
    it('should call onSuccess when resolved', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => resolve('foo'), 0);
      }).then((result) => {
        assert.equal(result, 'foo');

        done();
      });
    });

    it('should call onSuccess when resolved before then is attached', function(done) {
      new Promise((resolve, reject) => {
        resolve('foo');
      }).then((result) => {
        assert.equal(result, 'foo');

        done();
      });
    });

    it('should NOT throw an error when resolving a promise twice', function(done) {
      new Promise((resolve, reject) => {
        resolve('foo');
        resolve('foo');

        done();
      });
    });

    it('should not call onFail when resolved', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => resolve('foo'), 0);
      }).then((result) => {
        assert.equal(result, 'foo');

        done();
      }, (err) => {
        assert.ok(false, 'shouldn\'t throw an error');
      });
    });

    it('should not call onSuccess when rejected', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => reject('err'), 0);
      }).then(() => {
        assert.ok(false, 'should not resolve');
      }, (err) => {
        assert.equal(err, 'err');

        done();
      });
    });
  });

  describe('catch', function() {
    it('should call onFail when rejected', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => reject('err'), 0);
      }).catch((err) => {
        assert.equal(err, 'err');

        done();
      });
    });

    it('should NOT throw an error when rejecting a promise twice', function(done) {
      new Promise((resolve, reject) => {
        reject('foo');
        reject('foo');

        done();
      });
    });

    it('should not propagate an error when caught', function(done) {
      let log = [];

      const promise = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('My Error'));

          assert.deepEqual(log, ['catch', 'then']);

          done();
        }, 0);
      });

      promise.catch((err) => {
        assert.equal(err, 'Error: My Error');

        log.push('catch');
      })
        .then((result) => {
          assert.strictEqual(result, undefined);

          log.push('then');
        })
        .catch((err) => {
          assert.ok(false, 'should not catch error another time');

          log.push('catch2')
        });
    });

    it('should rethrow an error', function(done) {
      const promise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('My Error')), 0);
      });

      promise.catch((err) => {
        assert.equal(err, 'Error: My Error');

        throw new Error('My Error 2');
      })
      .catch((err) => {
        assert.equal(err, 'Error: My Error 2');

        done();
      });
    });

    it('should pass onFail to chained promises', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('My Error')), 0);
      })
        .then(() => {
          assert.ok(false, 'should not call onSuccess');
        })
        .catch((err) => {
          assert.equal(err, 'Error: My Error');

          done();
        });
    });

  });

  describe('always', function() {
    it('should call always when resolved', function(done) {
      const promise = new Promise((resolve, reject) => {
        setTimeout(() => resolve('foo'), 0);
      });

      promise.always((result) => {
        assert.equal(result, 'foo');

        done();
      });
    });

    it('should call always when rejected', function(done) {
      const promise = new Promise((resolve, reject) => {
        setTimeout(() => reject('err'), 0);
      });

      promise.always((result) => {
        assert.equal(result, 'err');

        done();
      });
    });
  });

  describe('status', function() {
    it('should have correct status before and after being resolved', function(done) {
      const p = new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(1);

          assert.equal(p.resolved, true);
          assert.equal(p.rejected, false);
          assert.equal(p.pending, false);

          done();
        }, 0);
      });

      assert.equal(p.resolved, false);
      assert.equal(p.rejected, false);
      assert.equal(p.pending, true);
    });

    it('should have correct status before and after being rejected', function(done) {
      const p = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(1);

          assert.equal(p.resolved, false);
          assert.equal(p.rejected, true);
          assert.equal(p.pending, false);

          done();
        }, 0);
      });

      assert.equal(p.resolved, false);
      assert.equal(p.rejected, false);
      assert.equal(p.pending, true);
    });
  });

  it('should resolve a promise returned by a onSuccess callback', function(done) {
    new Promise((resolve, reject) => {
      resolve(1)
    }).then((result) => {
      assert.equal(result, 1);

      return new Promise((resolve, reject) => {
        resolve(2);
      });
    }).then((result) => {
      assert.equal(result, 2);

      done();
    });
  });

  it('should resolve a promise returned by an onFail callback', function(done) {
    new Promise((resolve, reject) => {
      reject(1)
    }).catch((err) => {
      assert.equal(err, 1);

      return new Promise((resolve, reject) => {
        resolve(2)
      });
    }).then((result) => {
      assert.equal(result, 2);

      done();
    });
  });

  it('should resolve a rejected error from a returned promise (2)', function(done) {
    new Promise((resolve, reject) => {
      reject(1)
    }).catch((err) => {
      assert.equal(err, 1);

      return new Promise((resolve, reject) => {
        reject(2);
      });
    }).catch((err) => {
      assert.equal(err, 2);
      done();
    });
  });

  it('should catch an error thrown by an onSuccess callback', function(done) {
    new Promise((resolve, reject) => {
      resolve(1)
    }).then((result) => {
      assert.equal(result, 1);

      throw new Error('2');
    }).catch((err) => {
      assert.equal(err.toString(), 'Error: 2');

      done();
    });
  });

  it('should catch an error thrown by an onFail callback', function(done) {
    new Promise((resolve, reject) => {
      reject(new Error(1))
    }).catch((err) => {
      assert.equal(err.toString(), 'Error: 1');

      throw new Error('2');
    }).catch((err) => {
      assert.equal(err.toString(), 'Error: 2');

      done();
    });
  });

  it('should pass arguments through the promise chain which is already resolved', function(done) {
    let log = [];

    const promise = new Promise((resolve, reject) => {
      resolve(1);
    });

    // first chain
    promise.then((res) => {
      log.push(res);

      assert.equal(res, 1);
    });

    // second chain
    promise.then((res) => {
      log.push(res);

      assert.equal(res, 1);

      return new Promise((resolve, reject) => {
        reject(2)
      });
    })
    .then(() => {
      assert.ok(false, 'should not resolve')
    })
    .catch((res) => {
      assert.equal(res, 2);

      log.push(res);

      throw 3;
    })
    .catch((err) => {
      log.push(err);

      assert.equal(err, 3);

      return new Promise((resolve, reject) => {
        reject(4)
      })
    })
    .then(null, (err) => {
      log.push(err);

      assert.equal(err, 4);

      return new Promise((resolve, reject) => {
        resolve(5)
      });
    })
    .then((res) => {
      log.push(res);

      assert.equal(res, 5);
    })
    .catch(() => {
      log.push('fail')
    });

    assert.equal(log.join(','), '1,1,2,3,4,5');

    done();
  });

  it('should pass arguments through the promise chain which is not yet resolved', function(done) {
    let log = [];

    const promise = new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(1)

        assert.equal(log.join(','), '1,1,2,3,4,5');

        done();
      }, 0)
    });

    // first chain
    promise.then((res) => {
      log.push(res);

      assert.equal(res, 1);
    });

    // second chain
    promise.then((res) => {
      log.push(res);

      assert.equal(res, 1);

      return new Promise((resolve, reject) => {
        reject(2)
      })
    })
    .then(() => {
      assert.ok(false, 'should not resolve')
    })
    .catch((res) => {
      assert.equal(res, 2);

      log.push(res);

      throw 3;
    })
    .catch((err) => {
      log.push(err);

      assert.equal(err, 3);

      return new Promise((resolve, reject) => {
        reject(4)
      })
    })
    .then(null, (err) => {
      log.push(err);

      assert.equal(err, 4);

      return new Promise((resolve, reject) => {
        resolve(5)
      })
    })
    .then((res) => {
      log.push(res);

      assert.equal(res, 5);
    })
    .catch(() => {
      log.push('fail')
    });
  });

  describe('cancel', function() {
    it('should cancel a promise', function(done) {
      const p = new Promise((resolve, reject) => {})
        .catch((err) => {
          assert(err instanceof Promise.CancellationError);

          done();
        });

      setTimeout(() => p.cancel(), 10);
    });

    it('should cancel a promise and catch afterwards', function(done) {
      const p = new Promise((resolve, reject) => {}).cancel();

      p.catch((err) => {
        assert(err instanceof Promise.CancellationError);

        done();
      })
    });

    it('should propagate cancellation of a promise to the promise parent', function(done) {
      const p = new Promise((resolve, reject) => {});

      let processing = 2;

      function next() {
        processing--;

        if (processing == 0) {
          done();
        }
      }

      const p1 = p.catch((err) => {
        assert(err instanceof Promise.CancellationError);

        next();
      });

      const p2 = p.catch((err) => {
        assert(err instanceof Promise.CancellationError);

        next();
      });

      p1.cancel();
    });
  });

  describe('timeout', function() {
    it('should timeout a promise', function(done) {
      new Promise((resolve, reject) => {})
        .timeout(30)
        .catch((err) => {
          assert(err instanceof Promise.TimeoutError);

          done();
        })
    });

    it('should timeout a promise afterwards', function(done) {
      const p = new Promise((resolve, reject) => {})
        .catch((err) => {
          assert(err instanceof Promise.TimeoutError);

          done();
        });

      p.timeout(30)
    });

    it('timeout should be stopped when promise resolves', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(1);
       }, 0);
      })
        .timeout(30)
        .then((result) => {
          assert.equal(result, 1);

          done();
        })
        .catch((err) => {
          assert.ok(false, 'should not throw an error');
        });
    });

    it('timeout should be stopped when promise rejects', function(done) {
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('My Error'));
        }, 0);
      })
        .timeout(30)
        .catch((err) => {
          assert.equal(err.toString(), 'Error: My Error');

          done();
        });
    });

    it('timeout should be propagated to parent promise', function(done) {
      new Promise((resolve, reject) => {})
        .then() // force creation of a child promise
        .catch((err) => {
          assert(err instanceof Promise.TimeoutError);

          done();
        })
        .timeout(30);
    });
  });

  describe('defer', function() {
    it('should create a resolver and resolve it', function(done) {
      const resolver = Promise.defer();

      resolver.promise.then((result) => {
        assert.equal(result, 3);

        done();
      });

      resolver.resolve(3);
    });

    it('should create a resolver and reject it', function(done) {
      const resolver = Promise.defer();

      resolver.promise.catch((err) => {
        assert.equal(err.toString(), 'Error: My Error');

        done();
      });

      resolver.reject(new Error('My Error'));
    })
  });

  describe('all', function() {
    it('should resolve "all" when all promises are resolved', function(done) {
      const foo = new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve('foo');
        }, 25);
      });
      const bar = new Promise((resolve, reject) => {
        resolve('bar');
      });
      const baz = new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve('baz');
        }, 40);
      });
      const qux = new Promise((resolve, reject) => {
        resolve('qux');
      });

      Promise.all([foo, bar, baz, qux])
        .then((results) => {
          assert.ok(true, 'then');
          assert.deepEqual(results, ['foo', 'bar', 'baz', 'qux']);

          done();
        })
        .catch(() => {
          assert.ok(false, 'catch');
        });
    });

    it('should reject "all" when any of the promises failed', function(done) {
      const foo = new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve('foo');
        }, 40);
      });
      const bar = new Promise((resolve, reject) => {
        resolve('bar');
      });
      const baz = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject('The Error');
        }, 25);
      });
      const qux = new Promise((resolve, reject) => {
        resolve('qux');
      });

      Promise.all([foo, bar, baz, qux])
        .then((result) => {
          assert.ok(false, 'should not resolve');
        })
        .catch((err) => {
          assert.ok(true, 'catch');
          assert.equal(err, 'The Error');

          done();
        });
    });

    it('should resolve "all" when all of the promises are already resolved', function(done) {
      const foo = new Promise((resolve, reject) => {
        resolve('foo');
      });
      const bar = new Promise((resolve, reject) => {
        resolve('bar');
      });
      const baz = new Promise((resolve, reject) => {
        resolve('baz');
      });
      const qux = new Promise((resolve, reject) => {
        resolve('qux');
      });

      Promise.all([foo, bar, baz, qux])
        .then((results) => {
          assert.ok(true, 'then');
          assert.deepEqual(results, ['foo', 'bar', 'baz', 'qux']);

          done();
        })
        .catch(() => {
          assert.ok(false, 'catch');
        });
    });

    it('should resolve "all" when empty', function(done) {
      Promise.all([])
        .then((results) => {
          assert.ok(true, 'then');
          assert.deepEqual(results, []);

          done();
        })
        .catch(() => {
          assert.ok(false, 'catch');
        });
    });
  });
});

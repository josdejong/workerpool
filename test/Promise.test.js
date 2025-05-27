var assert = require('assert');
var {Promise} = require('../src/Promise');

describe ('Promise', function () {

  describe('construction', function () {
    it('should throw an error when constructed without handler', function () {
      assert.throws(function () {new Promise();}, SyntaxError);
    });

    it('should construct a promise with handler and resolve it', function (done) {
      new Promise(function (resolve, reject) {
        resolve(2)
      })
          .then(function (result) {
            assert.strictEqual(result, 2);
            done();
          });
    });

    it('should construct a promise with handler and reject it', function (done) {
      new Promise(function (resolve, reject) {
        reject(2)
      })
          .catch(function (error) {
            assert.strictEqual(error, 2);
            done();
          });
    });

    it('should throw an error when constructed without new keyword', function () {
      assert.throws(function () {Promise()}, /Error/);
    });
  });

  describe('then', function () {
    it('should call onSuccess when resolved', function (done) {
      new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve('foo');
        }, 0);
      }).then(function (result) {
        assert.strictEqual(result, 'foo');
        done();
      });
    });

    it('should call onSuccess when resolved before then is attached', function (done) {
      var promise = new Promise(function (resolve, reject) {
        resolve('foo');
      });

      promise.then(function (result) {
        assert.strictEqual(result, 'foo');
        done();
      });
    });

    it('should NOT throw an error when resolving a promise twice', function (done) {
      new Promise(function (resolve, reject) {
        resolve('foo');
        resolve('foo');

        done();
      });
    });

    it('should not call onFail when resolved', function (done) {
      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve('foo');
        }, 0);
      });

      promise.then(function (result) {
        assert.strictEqual(result, 'foo');
        done();
      }, function (err) {
        assert.ok(false, 'shouldn\'t throw an error');
      });
    });

    it('should not call onSuccess when rejected', function (done) {
      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject('err');
        }, 0);
      });

      promise.then(function () {
        assert.ok(false, 'should not resolve');
      }, function (err) {
        assert.strictEqual(err.toString(), 'err');
        done();
      });
    });

  });

  describe('catch', function () {
    it('should call onFail when rejected', function (done) {
      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject('err');
        }, 0);
      });

      promise.catch(function (err) {
        assert.strictEqual(err.toString(), 'err');
        done();
      });
    });

    it('should NOT throw an error when rejecting a promise twice', function (done) {
      var promise = new Promise(function (resolve, reject) {
        reject('foo');
        reject('foo');

        done();
      });
    });

    it('should not propagate an error when caught', function (done) {
      var log = [];

      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {

          reject(new Error('My Error'));

          assert.deepStrictEqual(log, ['catch', 'then']);

          done();
        }, 0);
      });

      promise.catch(function (err) {
        assert.strictEqual(err.toString(), 'Error: My Error');
        log.push('catch');
      })
          .then(function (result) {
            assert.strictEqual(result, undefined);
            log.push('then');
          })
          .catch(function (err) {
            assert.ok(false, 'should not catch error another time');
            log.push('catch2')
          });

    });

    it('should rethrow an error', function (done) {
      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject(new Error('My Error'));
        }, 0);
      });

      promise.catch(function (err) {
        assert.strictEqual(err.toString(), 'Error: My Error');
        throw new Error('My Error 2');
      })
          .catch(function (err) {
            assert.strictEqual(err.toString(), 'Error: My Error 2');
            done();
          });
    });

    it('should pass onFail to chained promises', function (done) {
      new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject(new Error('My Error'));
        }, 0);
      })
          .then(function () {
            assert.ok(false, 'should not call onSuccess');
          })
          .catch(function (err) {
            assert.strictEqual(err.toString(), 'Error: My Error');
            done();
          });
    });

  });

  describe('always', function () {
    it('should call always when resolved', function (done) {
      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve('foo');
        }, 0);
      });

      promise.always(function (result) {
        assert.strictEqual(result.toString(), 'foo');
        done();
      });
    });

    it('should call always when rejected', function (done) {
      var promise = new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject('err');
        }, 0);
      });

      promise.always(function (result) {
        assert.strictEqual(result, 'err');
        done();
      });
    });
  });

  describe('finally', function () {
    it('should call finally when resolved', function(done) {
      var isFullfilled = false;
      var finallyRan = false;
      var p = new Promise(function(resolve, _reject) {
        resolve(1); 
      }).then(function(value) {
        isFullfilled = true; 
      }).finally(function(value) {
        assert.ok(isFullfilled, "should call finally after resolve");
        assert.equal(value, undefined);
        finallyRan = true;
      }).then(function() {
        assert.ok(finallyRan, "finallyRan should be called");

        done();
      });

      assert.strictEqual(p.resolved, true);
      assert.strictEqual(p.rejected, false);
      assert.strictEqual(p.pending, false);
    });

    it('should call finally when rejected and error is not returned', function(done) {
      var isFullfilled = false;
      var finallyRan = false;
      var p = new Promise(function(_resolve, reject) {
        reject(new Error('An error has occured')); 
      }).catch(function(_err) {
        isFullfilled = true;
        // dont return the error so the promise doesnt reject and the chain can continue
      }).finally(function(value) {
        assert.ok(isFullfilled, "should call finally after reject");
        assert.equal(value, undefined);
        finallyRan = true;
      }).then(function() {
        assert.ok(finallyRan, "finallyRan should be called");

        done();
      });

      assert.strictEqual(p.resolved, false);
      assert.strictEqual(p.rejected, true);
      assert.strictEqual(p.pending, false);
    });

    it('should continue promise chain from finally if not rejected', function(done) {
      var isFullfilled = false;
      var finallyRan = false;
      var p = new Promise(function(resolve, _reject) {
        resolve(); 
      }).then(function () {
        isFullfilled = true; 
      }).finally(function(value) {
        assert.ok(isFullfilled, "should call finally after resolve");
        assert.equal(value, undefined);
        finallyRan = true;
      });

      return p.then(function() {
        assert.ok(finallyRan, 'finallyRan should be true');
        assert.strictEqual(p.resolved, true);
        assert.strictEqual(p.rejected, false);
        assert.strictEqual(p.pending, false);
        done();
      });
    });

    it('should not pass arguments to finally (resolving)', function(done) {
      new Promise(resolve => resolve(42))
        .finally((arg) => {
          assert.strictEqual(arg, undefined)
          done()
        })
    });

    it('should not pass arguments to finally (rejecting)', function(done) {
      new Promise((resolve, reject) => reject('Some error'))
        .finally((arg) => {
          assert.strictEqual(arg, undefined)
          done()
        })
    });

    it('should not return arguments from finally', function(done) {
      new Promise((resolve) => resolve())
        .finally(() => {
          return 42
        })
        .then((arg) => {
          assert.strictEqual(arg, undefined)
          done()
        })
    });

    it('should pass previous value along when calling finally', function(done) {
      let finallyCalled = false

      new Promise((resolve) => resolve(42))
        .finally(() => {
          finallyCalled = true
          return 123
        })
        .then((arg) => {
          assert.strictEqual(arg, 42)
          assert.strictEqual(finallyCalled, true)
          done()
        })
    });

    it('should rethrow previous error along when calling finally', function(done) {
      let finallyCalled = false

      new Promise((resolve, reject) => reject('some error'))
        .finally(() => {
          finallyCalled = true
          return 123
        })
        .catch((err) => {
          assert.strictEqual(err, 'some error')
          assert.strictEqual(finallyCalled, true)
          done()
        })
    });

    it('should await a Promise returned by finally (resolving)', function(done) {
      let finallyCalled = false

      new Promise((resolve) => resolve(42))
        .finally(() => {
          return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
            finallyCalled = true
          })
        })
        .then((arg) => {
          assert.strictEqual(arg, 42)
          assert.strictEqual(finallyCalled, true)
          done()
        })
    });

    it('should await a Promise returned by finally (rejecting)', function(done) {
      let finallyCalled = false

      new Promise((resolve, reject) => reject('some error'))
        .finally(() => {
          return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
            finallyCalled = true
          })
        })
        .catch((err) => {
          assert.strictEqual(err, 'some error')
          assert.strictEqual(finallyCalled, true)
          done()
        })
    });

    it('should propagate cancelling a Promise via finally', function(done) {
      let isResolved = false
      let finallyCalled = false

      const promise = new Promise((resolve, _reject) => {
        setTimeout(resolve, 100)
      })
        .then(() => {
          // we should not reach this
          isResolved = true
        })
        .finally(() => {
          finallyCalled = true
        })

      promise.cancel()

      setTimeout(() => {
        assert.strictEqual(isResolved, false)
        assert.strictEqual(finallyCalled, true)
        done()
      }, 200)
    });

    it('should allow null finally', function(done) {
      new Promise((resolve) => resolve())
        .finally(null)
        .then((arg) => {
          assert.strictEqual(arg, undefined)
          done()
        })
    });
  });

  describe('status', function () {
    it('should have correct status before and after being resolved', function (done) {
      var p = new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(1);

          assert.strictEqual(p.resolved, true);
          assert.strictEqual(p.rejected, false);
          assert.strictEqual(p.pending, false);

          done();
        }, 0);
      });

      assert.strictEqual(p.resolved, false);
      assert.strictEqual(p.rejected, false);
      assert.strictEqual(p.pending, true);
    });

    it('should have correct status before and after being rejected', function (done) {
      var p = new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject(1);
 
          assert.strictEqual(p.resolved, false);
          assert.strictEqual(p.rejected, true);
          assert.strictEqual(p.pending, false);

          done();
        }, 0);
      });

      assert.strictEqual(p.resolved, false);
      assert.strictEqual(p.rejected, false);
      assert.strictEqual(p.pending, true);
    });
  });

  it('should resolve a promise returned by a onSuccess callback', function (done) {
    new Promise(function (resolve, reject) {
      resolve(1)
    })
        .then(function (result) {
          assert.strictEqual(result, 1);
          return new Promise(function (resolve, reject) {
            resolve(2);
          });
        })
        .then(function (result) {
          assert.strictEqual(result, 2);
          done();
        });
  });

  it('should resolve a promise returned by an onFail callback', function (done) {
    new Promise(function (resolve, reject) {
      reject(1)
    })
        .catch(function (err) {
          assert.strictEqual(err, 1);
          return new Promise(function (resolve, reject) {
            resolve(2)
          });
        })
        .then(function (result) {
          assert.strictEqual(result, 2);
          done();
        });
  });

  it('should resolve a rejected error from a returned promise (2)', function (done) {
    new Promise(function (resolve, reject) {
      reject(1)
    })
        .catch(function (err) {
          assert.strictEqual(err, 1);
          return new Promise(function (resolve, reject) {
            reject(2);
          });
        })
        .catch(function (err) {
          assert.strictEqual(err, 2);
          done();
        });
  });

  it('should catch an error thrown by an onSuccess callback', function (done) {
    new Promise(function (resolve, reject) {
      resolve(1)
    })
        .then(function (result) {
          assert.strictEqual(result, 1);
          throw new Error('2');
        })
        .catch(function (err) {
          assert.strictEqual(err.toString(), 'Error: 2');
          done();
        });
  });

  it('should catch an error thrown by an onFail callback', function (done) {
    new Promise(function (resolve, reject) {
      reject(new Error('1'))
    })
        .catch(function (err) {
          assert.strictEqual(err.toString(), 'Error: 1');
          throw new Error('2');
        })
        .catch(function (err) {
          assert.strictEqual(err.toString(), 'Error: 2');
          done();
        });
  });

  it('should pass arguments through the promise chain which is already resolved', function (done) {
    var log = [];
    var promise = new Promise(function (resolve, reject) {
      resolve(1);
    });

    // first chain
    promise
        .then(function (res){
          log.push(res);
          assert.strictEqual(res, 1);
        });

    // second chain
    promise.then(function (res){
          log.push(res);
          assert.strictEqual(res, 1);
          return new Promise(function (resolve, reject) {
            reject(2)
          });
        })
        .then(function (){
          assert.ok(false, 'should not resolve')
        })
        .catch(function (res) {
          assert.strictEqual(res, 2);
          log.push(res);
          throw 3;
        })
        .catch(function (err) {
          log.push(err);
          assert.strictEqual(err, 3);
          return new Promise(function (resolve, reject) {
            reject(4)
          })
        })
        .then(null, function (err){
          log.push(err);
          assert.strictEqual(err, 4);
          return new Promise(function (resolve, reject) {
            resolve(5)
          });
        })
        .then(function (res) {
          log.push(res);
          assert.strictEqual(res, 5);
        })
        .catch(function (){
          log.push('fail')
        });

    assert.strictEqual(log.join(','), '1,1,2,3,4,5');
    done();
  });

  it('should pass arguments through the promise chain which is not yet resolved', function (done) {
    var log = [];

    var promise = new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(1)

        assert.strictEqual(log.join(','), '1,1,2,3,4,5');
        done();
      }, 0)
    });

    // first chain
    promise
        .then(function (res){
          log.push(res);
          assert.strictEqual(res, 1);
        });

    // second chain
    promise
        .then(function (res){
          log.push(res);
          assert.strictEqual(res, 1);
          return new Promise(function (resolve, reject) {
            reject(2)
          })
        })
        .then(function (){
          assert.ok(false, 'should not resolve')
        })
        .catch(function (res) {
          assert.strictEqual(res, 2);
          log.push(res);
          throw 3;
        })
        .catch(function (err) {
          log.push(err);
          assert.strictEqual(err, 3);
          return new Promise(function (resolve, reject) {
            reject(4)
          })
        })
        .then(null, function (err){
          log.push(err);
          assert.strictEqual(err, 4);
          return new Promise(function (resolve, reject) {
            resolve(5)
          })
        })
        .then(function (res) {
          log.push(res);
          assert.strictEqual(res, 5);
        })
        .catch(function (){
          log.push('fail')
        });
  });

  describe('cancel', function () {
    it('should cancel a promise', function (done) {
      var p = new Promise(function (resolve, reject) {})
          .catch(function (err) {
            assert(err instanceof Promise.CancellationError);
            done();
          });

      setTimeout(function () {
        p.cancel();
      }, 10);
    });

    it('should cancel a promise and catch afterwards', function (done) {
      var p = new Promise(function (resolve, reject) {}).cancel();

      p.catch(function (err) {
        assert(err instanceof Promise.CancellationError);
        done();
      })
    });

    it('should propagate cancellation of a promise to the promise parent', function (done) {
      var p = new Promise(function (resolve, reject) {});

      var processing = 2;
      function next() {
        processing--;
        if (processing == 0) done();
      }

      var p1 = p.catch(function (err) {
        assert(err instanceof Promise.CancellationError);
        next();
      });

      var p2 = p.catch(function (err) {
        assert(err instanceof Promise.CancellationError);
        next();
      });

      p1.cancel();
    });
  });

  describe('timeout', function () {
    it('should timeout a promise', function (done) {
      new Promise(function (resolve, reject) {})
          .timeout(30)
          .catch(function (err) {
            assert(err instanceof Promise.TimeoutError);
            done();
          })
    });

    it('should timeout a promise afterwards', function (done) {
      var p = new Promise(function (resolve, reject) {})
          .catch(function (err) {
            assert(err instanceof Promise.TimeoutError);
            done();
          });

      p.timeout(30)
    });

    it('timeout should be stopped when promise resolves', function (done) {
      new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(1);
       }, 0);
      })
          .timeout(30)
          .then(function (result) {
            assert.strictEqual(result, 1);
            done();
          })
          .catch(function (err) {
            assert.ok(false, 'should not throw an error');
          });
    });

    it('timeout should be stopped when promise rejects', function (done) {
      new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject(new Error('My Error'));
        }, 0);
      })
          .timeout(30)
          .catch(function (err) {
            assert.strictEqual(err.toString(), 'Error: My Error');
            done();
          });
    });

    it('timeout should be propagated to parent promise', function (done) {
      new Promise(function (resolve, reject) {})
          .then() // force creation of a child promise
          .catch(function (err) {
            assert(err instanceof Promise.TimeoutError);
            done();
          })
          .timeout(30);
    });
  });

  describe('defer', function () {
    it('should create a resolver and resolve it', function (done) {
      var resolver = Promise.defer();

      resolver.promise.then(function (result) {
        assert.strictEqual(result, 3);
        done();
      });

      resolver.resolve(3);
    });

    it('should create a resolver and reject it', function (done) {
      var resolver = Promise.defer();

      resolver.promise.catch(function (err) {
        assert.strictEqual(err.toString(), 'Error: My Error');
        done();
      });

      resolver.reject(new Error('My Error'));
    })
  });

  describe('all', function () {

    it('should resolve "all" when all promises are resolved', function (done) {
      var foo = new Promise(function (resolve, reject) {
            setTimeout(function () {
              resolve('foo');
            }, 25);
          }),
          bar = new Promise(function (resolve, reject) {
            resolve('bar');
          }),
          baz = new Promise(function (resolve, reject) {
            setTimeout(function () {
              resolve('baz');
            }, 40);
          }),
          qux = new Promise(function (resolve, reject) {
            resolve('qux');
          });

      Promise.all([foo, bar, baz, qux])
          .then(function (results) {
            assert.ok(true, 'then');
            assert.deepStrictEqual(results, ['foo', 'bar', 'baz', 'qux']);

            done();
          })
          .catch(function (){
            assert.ok(false, 'catch');
          });
    });

    it('should reject "all" when any of the promises failed', function (done) {
      var foo = new Promise(function (resolve, reject) {
            setTimeout(function () {
              resolve('foo');
            }, 40);
          }),
          bar = new Promise(function (resolve, reject) {
            resolve('bar');
          }),
          baz = new Promise(function (resolve, reject) {
            setTimeout(function () {
              reject('The Error');
            }, 25);
          }),
          qux = new Promise(function (resolve, reject) {
            resolve('qux');
          });

      Promise.all([foo, bar, baz, qux])
          .then(function (result){
            assert.ok(false, 'should not resolve');
          })
          .catch(function (err){
            assert.ok(true, 'catch');
            assert.strictEqual(err.toString(), 'The Error');
            done();
          });
    });

    it('should resolve "all" when all of the promises are already resolved', function (done) {
      var foo = new Promise(function (resolve, reject) {
            resolve('foo');
          }),
          bar = new Promise(function (resolve, reject) {
            resolve('bar');
          }),
          baz = new Promise(function (resolve, reject) {
            resolve('baz');
          }),
          qux = new Promise(function (resolve, reject) {
            resolve('qux');
          });

      Promise.all([foo, bar, baz, qux])
          .then(function (results) {
            assert.ok(true, 'then');
            assert.deepStrictEqual(results, ['foo', 'bar', 'baz', 'qux']);

            done();
          })
          .catch(function (){
            assert.ok(false, 'catch');
          });
    });

    it('should resolve "all" when empty', function (done) {
      Promise.all([])
          .then(function (results) {
            assert.ok(true, 'then');
            assert.deepStrictEqual(results, []);

            done();
          })
          .catch(function (){
            assert.ok(false, 'catch');
          });
    });
  });

});

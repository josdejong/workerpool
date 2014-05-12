var assert = require('assert'),
    Promise = require('../lib/Promise');

describe ('Promise', function () {

  describe('construction', function () {
    it('should construct a promise without handler', function () {
      var promise = new Promise();
      assert(promise instanceof Promise);
    });

    it('should construct a promise with handler and resolve it', function (done) {
      new Promise(function (resolve, reject) {
        resolve(2)
      })
          .then(function (result) {
            assert.equal(result, 2);
            done();
          });
    });

    it('should construct a promise with handler and reject it', function (done) {
      new Promise(function (resolve, reject) {
        reject(2)
      })
          .catch(function (error) {
            assert.equal(error, 2);
            done();
          });
    });

    it('should throw an error when constructed without new keyword', function () {
      assert.throws(function () {Promise()}, /Error/);
    });
  });

  describe('then', function () {
    it('should call onSuccess when resolved', function (done) {
      var promise = new Promise();

      promise.then(function (result) {
        assert.equal(result, 'foo');
        done();
      });

      promise.resolve('foo');
    });

    it('should call onSuccess when resolved before then is attached', function (done) {
      var promise = new Promise();

      promise.resolve('foo');

      promise.then(function (result) {
        assert.equal(result, 'foo');
        done();
      });
    });

    it('should not call onSuccess again when resolving a promise twice', function () {
      var promise = new Promise();
      var count = 0;

      promise.then(function () {
        count ++;
      });

      promise.resolve('foo');
      promise.resolve('foo');

      assert.equal(count, 1);
    });

    it('should not call onFail when resolved', function (done) {
      var promise = new Promise();

      promise.then(function (result) {
        assert.equal(result, 'foo');
        done();
      }, function (err) {
        assert.ok(false, 'shouldn\'t throw an error');
      });

      promise.resolve('foo');
    });

    it('should not call onSuccess when rejected', function (done) {
      var promise = new Promise();

      promise.then(function () {
        assert.ok(false, 'should not resolve');
      }, function (err) {
        assert.equal(err, 'err');
        done();
      });

      promise.reject('err');
    });

  });

  describe('catch', function () {
    it('should call onFail when rejected', function (done) {
      var promise = new Promise();

      promise.catch(function (err) {
        assert.equal(err, 'err');
        done();
      });

      promise.reject('err');
    });

    it('should not call onFail again when rejecting a promise twice', function () {
      var promise = new Promise();
      var count = 0;

      promise.catch(function () {
        count ++;
      });

      promise.reject('foo');
      promise.reject('foo');

      assert.equal(count, 1);
    });

  });

  describe('always', function () {
    it('should call always when resolved', function (done) {
      var promise = new Promise();

      promise.always(function (result) {
        assert.equal(result, 'foo');
        done();
      });

      promise.resolve('foo');
    });

    it('should call always when rejected', function (done) {
      var promise = new Promise();

      promise.always(function (result) {
        assert.equal(result, 'err');
        done();
      });

      promise.reject('err');
    });
  });

  it('should resolve a promise returned by a onSuccess callback', function (done) {
    new Promise()
        .then(function (result) {
          assert.equal(result, 1);
          return new Promise().resolve(2);
        })
        .then(function (result) {
          assert.equal(result, 2);
          done();
        })
        .resolve(1);
  });

  it('should resolve a promise returned by an onFail callback', function (done) {
    new Promise()
        .catch(function (err) {
          assert.equal(err, 1);
          return new Promise().resolve(2);
        })
        .then(function (result) {
          assert.equal(result, 2);
          done();
        })
        .reject(1);
  });

  it('should resolve a rejected error from a returned promise (2)', function (done) {
    new Promise()
        .catch(function (err) {
          assert.equal(err, 1);
          return new Promise().reject(2);
        })
        .catch(function (err) {
          assert.equal(err, 2);
          done();
        })
        .reject(1);
  });

  it('should catch an error thrown by an onSuccess callback', function (done) {
    new Promise()
        .then(function (result) {
          assert.equal(result, 1);
          throw new Error('2');
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: 2');
          done();
        })
        .resolve(1);
  });

  it('should catch an error thrown by an onFail callback', function (done) {
    new Promise()
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: 1');
          throw new Error('2');
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: 2');
          done();
        })
        .reject(new Error(1));
  });

  it('should pass arguments through the promise chain which is already resolved', function () {
    var log = [];
    new Promise()
        .then(function (res){
          log.push(res)
        })
        .resolve(1)
        .then(function (res){
          log.push(res)
          assert.equal(res, 1);
          return new Promise().reject(2)
        })
        .then(function (){
          assert('should not resolve')
        })
        .catch(function (res) {
          assert.equal(res, 2);
          log.push(res);
          throw 3;
        })
        .catch(function (err) {
          log.push(err);
          assert.equal(err, 3);
          return new Promise().reject(4)
        })
        .then(null, function (err){
          log.push(err);
          assert.equal(err, 4);
          return new Promise().resolve(5);
        })
        .then(function (res) {
          log.push(res);
          assert.equal(res, 5);
        })
        .catch(function (){
          log.push('fail')
        });

    assert.equal(log.join(','), '1,1,2,3,4,5');
  });

  it('should pass arguments through the promise chain which is not yet resolved', function () {
    var log = [];
    new Promise()
        .then(function (res){
          log.push(res)
        })
        .then(function (res){
          log.push(res)
          assert.equal(res, 1);
          return new Promise().reject(2)
        })
        .then(function (){
          assert('should not resolve')
        })
        .catch(function (res) {
          assert.equal(res, 2);
          log.push(res);
          throw 3;
        })
        .catch(function (err) {
          log.push(err);
          assert.equal(err, 3);
          return new Promise().reject(4)
        })
        .then(null, function (err){
          log.push(err);
          assert.equal(err, 4);
          return new Promise().resolve(5);
        })
        .then(function (res) {
          log.push(res);
          assert.equal(res, 5);
        })
        .catch(function (){
          log.push('fail')
        })
        .resolve(1);


    assert.equal(log.join(','), '1,1,2,3,4,5');
  });

  describe('cancel', function () {
    it('should cancel a promise', function (done) {
      var p = new Promise()
          .catch(function (err) {
            assert(err instanceof Promise.CancellationError);
            done();
          });

      setTimeout(function () {
        p.cancel();
      }, 10);
    });

    it('should cancel a promise and catch afterwards', function (done) {
      var p = new Promise().cancel();

      p.catch(function (err) {
        assert(err instanceof Promise.CancellationError);
        done();
      })
    });
  });

  describe('timeout', function () {
    it('should timeout a promise', function (done) {
      var p = new Promise()
          .catch(function (err) {
            assert(err instanceof Promise.TimeoutError);
            done();
          });

      p.timeout(30);
    });

    it('timeout should be stopped when promise resolves', function (done) {
      var p = new Promise()
          .then(function (result) {
            assert.equal(result, 1);
            //done();
          })
          .catch(function (err) {
            assert.ok(false, 'should not throw an error');
          });

      p.timeout(30);
      p.resolve(1);
      setTimeout(done, 50);
    });

    it('timeout should be stopped when promise rejects', function (done) {
      var p = new Promise()
          .catch(function (err) {
            assert.equal(err.toString(), 'Error: My Error');
          });

      p.timeout(30);
      p.reject(new Error('My Error'));
      setTimeout(done, 50);
    });
  });

  describe('all', function () {

    it('should resolve "all" when all promises are resolved', function (done) {
      var foo = new Promise(),
          bar = new Promise(),
          baz = new Promise(),
          qux = new Promise();

      setTimeout(function () {
        foo.resolve('foo');
      }, 25);
      bar.resolve('bar');

      setTimeout(function () {
        baz.resolve('baz');
      }, 40);
      qux.resolve('qux');

      Promise.all([foo, bar, baz, qux])
          .then(function (results) {
            assert.ok(true, 'then');
            assert.deepEqual(results, ['foo', 'bar', 'baz', 'qux']);

            done();
          })
          .catch(function (){
            assert.ok(false, 'catch');
          });
    });

    it('should reject "all" when any of the promises failed', function (done) {
      var foo = new Promise(),
          bar = new Promise(),
          baz = new Promise(),
          qux = new Promise();

      setTimeout(function () {
        foo.resolve('foo');
      }, 40);
      bar.resolve('bar');

      setTimeout(function () {
        baz.reject('The Error');
      }, 25);
      qux.resolve('qux');

      Promise.all([foo, bar, baz, qux])
          .then(function (result){
            assert('should not resolve');
          })
          .catch(function (err){
            assert.ok(true, 'catch');
            assert.equal(err, 'The Error');
            done();
          });
    });
  })

});

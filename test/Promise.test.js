var assert = require('assert'),
    Promise = require('../lib/Promise');

function _checkStatus(actual, expected){
  return function (args){
    assert.equal(actual, expected);
    assert.deepEqual(args, ["foo", "bar"]);
  };
}

describe ('Promise', function () {

  describe('done', function () {
    it('should call done when resolved', function (done) {
      var promise = new Promise();

      promise.done(function (result) {
        assert.equal(result, 'foo');
        done();
      });

      promise.resolve('foo');
    });

    it('should call done when resolved before done is attached', function (done) {
      var promise = new Promise();

      promise.resolve('foo');

      promise.done(function (result) {
        assert.equal(result, 'foo');
        done();
      });
    });

    it('should not call done again when resolving a promise twice', function () {
      var promise = new Promise();
      var count = 0;

      promise.done(function (result) {
        count ++;
      });

      promise.resolve('foo');
      promise.resolve('foo');

      assert.equal(count, 1);
    });

  });

  describe('catch', function () {
    it('should call catch when rejected', function (done) {
      var promise = new Promise();

      promise.catch(function (err) {
        assert.equal(err, 'err');
        done();
      });

      promise.reject('err');
    });

    it('should not call catch again when rejecting a promise twice', function () {
      var promise = new Promise();
      var count = 0;

      promise.catch(function (result) {
        count ++;
      });

      promise.reject('foo');
      promise.reject('foo');

      assert.equal(count, 1);
    });

  });

  describe('then', function () {
    it('should call then when resolved', function (done) {
      var promise = new Promise();

      promise.then(function (result) {
        assert.equal(result, 'foo');
        done();
      }, function (err) {
        assert.ok(false, 'shouldn\'t throw an error');
      });

      promise.resolve('foo');
    });

    it('should call then when rejected', function (done) {
      var promise = new Promise();

      promise.then(function (result) {
        assert.ok(false, 'should not resolve');
      }, function (err) {
        assert.equal(err, 'err');
        done();
      });

      promise.reject('err');
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

  it('should pass arguments through the promise chain', function () {
    var log = [];
    new Promise()
        .done(function (a){ log.push(a) })
        .resolve(1)
        .then(function (a){
          return new Promise().reject(a + 2)
        })
        .done(function (){ log.push('fail') })
        .catch(function (a){ log.push(a) })
        .then(null, function (a){
          return new Promise().resolve(a + 3);
        })
        .done(function (a){ log.push(a) })
        .catch(function (){ log.push('fail') }) ;

    assert.equal(log.join('->'), '1->3->6');
  });

  describe('all', function () {

    it('should resolve all when all promises are resolved', function (done) {
      var foo = new Promise(),
          bar = new Promise(),
          baz = new Promise(),
          qux = new Promise();

      setTimeout(foo.resolve, 100);
      bar.resolve();

      setTimeout(baz.resolve, 150);
      qux.resolve();

      new Promise.all([foo, bar, baz, qux])
          .then(function (){
            assert.ok(true, 'then');
            done();
          })
          .catch(function (){
            assert.ok(false, 'catch');
          });
    });

    it('should reject all when any of the promises failed', function (done) {
      var foo = new Promise(),
          bar = new Promise(),
          baz = new Promise(),
          qux = new Promise();

      setTimeout(foo.resolve, 100);
      bar.resolve();

      setTimeout(baz.reject, 150);
      qux.resolve();

      new Promise.all([foo, bar, baz, qux])
          .then(function (){
            assert.ok(false, 'then');
          })
          .catch(function (){
            assert.ok(true, 'catch');
            done();
          });
    });
  })

});

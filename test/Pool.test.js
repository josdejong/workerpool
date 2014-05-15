var assert = require('assert'),
    Promise = require('../lib/Promise'),
    Pool = require('../lib/Pool');

function add(a, b) {
  return a + b;
}

describe('Pool', function () {

  it('should offload a function to a worker', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function add(a, b) {
      return a + b;
    }

    assert.equal(pool.workers.length, 0);

    pool.exec(add, [3, 4])
        .then(function (result) {
          assert.equal(result, 7);
          assert.equal(pool.workers.length, 1);

          pool.clear();

          assert.equal(pool.workers.length, 0);

          done();
        });

    assert.equal(pool.workers.length, 1);
  });

  it('should offload functions to multiple workers', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function add(a, b) {
      return a + b;
    }

    assert.equal(pool.workers.length, 0);

    Promise.all([
          pool.exec(add, [3, 4]),
          pool.exec(add, [2, 3])
        ])
        .then(function (results) {
          assert.deepEqual(results, [7, 5]);
          assert.equal(pool.workers.length, 2);

          pool.clear();
          done();
        });

    assert.equal(pool.workers.length, 2);
  });

  it('should put tasks in queue when all workers are busy', function (done) {
    var pool = new Pool({maxWorkers: 2});

    function add(a, b) {
      return a + b;
    }

    assert.equal(pool.tasks.length, 0);
    assert.equal(pool.workers.length, 0);

    var task1 = pool.exec(add, [3, 4]);
    var task2 = pool.exec(add, [2, 3]);

    assert.equal(pool.tasks.length, 0);
    assert.equal(pool.workers.length, 2);

    var task3 = pool.exec(add, [5, 7]);
    var task4 = pool.exec(add, [1, 1]);

    assert.equal(pool.tasks.length, 2);
    assert.equal(pool.workers.length, 2);

    Promise.all([
        task1,
        task2,
        task3,
        task4
        ])
        .then(function (results) {
          assert.deepEqual(results, [7, 5, 12, 2]);
          assert.equal(pool.tasks.length, 0);
          assert.equal(pool.workers.length, 2);

          pool.clear();
          done();
        });
  });

  it('should create a proxy', function (done) {
    var pool = new Pool();

    pool.proxy().then(function (proxy) {
      assert.deepEqual(Object.keys(proxy).sort(), ['methods', 'run']);

      proxy.methods()
          .then(function (methods) {
            assert.deepEqual(methods.sort(), ['methods', 'run']);
            done();
          })
          .catch(function (err) {
            assert('Should not throw an error');
          });
    });
  });

  it('should create a proxy of a custom worker', function (done) {
    var pool = new Pool(__dirname + '/workers/simple.js');

    pool.proxy().then(function (proxy) {
      assert.deepEqual(Object.keys(proxy).sort(), ['add','methods','multiply','run']);

      proxy.multiply(4, 3)
          .then(function (result) {
            assert.equal(result, 12);
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert('Should not throw an error');
          });
    });
  });

  it('should handle errors thrown by a worker', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function test() {
      throw new TypeError('Test error');
    }

    pool.exec(test)
        .catch(function (err) {
          assert.equal(err.toString(), 'TypeError: Test error');

          pool.clear();
          done();
        });
  });

  it('should cancel a task', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function forever() {
      while (1 > 0) {} // runs forever
    }

    var promise = pool.exec(forever)
        .then(function (result) {
          assert('promise should never resolve');
        })
      //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.CancellationError);

          assert.equal(pool.workers.length, 0);

          done();
        });

    // cancel the task
    setTimeout(function () {
      promise.cancel();
    }, 0);
  });

  it('should cancel a queued task', function (done) {
    var pool = new Pool({maxWorkers: 1});
    var reachedTheEnd = false;

    function delayed() {
      var Promise = require('../lib/Promise');

      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(1);
        }, 0);
      });
    }

    function one() {
      return 1;
    }

    var p1 = pool.exec(delayed)
        .then(function (result) {
          assert.equal(result, 1);
          assert.equal(reachedTheEnd, true);

          assert.equal(pool.workers.length, 1);
          assert.equal(pool.tasks.length, 0);

          done();
        });

    assert.equal(pool.workers.length, 1);
    assert.equal(pool.tasks.length, 0);

    var p2 = pool.exec(one); // will be queued
    assert.equal(pool.workers.length, 1);
    assert.equal(pool.tasks.length, 1);

    p2.cancel();            // cancel immediately
    assert.equal(pool.workers.length, 1);
    assert.equal(pool.tasks.length, 1);

    reachedTheEnd = true;
  });

  // TODO: test whether a task in the queue can be neatly cancelled

  it('should timeout a task', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function forever() {
      while (1 > 0) {} // runs forever
    }

    var promise = pool.exec(forever)
        .timeout(50)
        .then(function (result) {
          assert('promise should never resolve');
        })
      //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);

          assert.equal(pool.workers.length, 0);

          done();
        });
  });

  it('should handle crashed workers (1)', function (done) {
    var pool = new Pool({maxWorkers: 1});

    pool.exec(add)
        .then(function () {
          assert('Promise should not be resolved');
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: Worker terminated unexpectedly');

          assert.equal(pool.workers.length, 0);

          // validate whether a new worker is spawned
          pool.exec(add, [2,3])
              .then(function (result) {
                assert.equal(result, 5);

                assert.equal(pool.workers.length, 1);

                pool.clear();
                done();
              });

          assert.equal(pool.workers.length, 1);
        });

    assert.equal(pool.workers.length, 1);

    // kill the worker so it will be terminated
    pool.workers[0].worker.kill();

    assert.equal(pool.workers.length, 1);
  });

  describe('options', function () {

    it('should throw an error on invalid type or number of maxWorkers', function () {
      assert.throws(function () {
        new Pool({maxWorkers: 'a string'});
      }, TypeError);

      assert.throws(function () {
        new Pool({maxWorkers: 2.5});
      }, TypeError);

      assert.throws(function () {
        new Pool({maxWorkers: 0});
      }, TypeError);

      assert.throws(function () {
        new Pool({maxWorkers: -1});
      }, TypeError);
    });

    it('should limit to the configured number of max workers', function () {
      var pool = new Pool({maxWorkers: 2});

      pool.exec(add, [1, 2]);
      pool.exec(add, [3, 4]);
      pool.exec(add, [5, 6]);
      pool.exec(add, [7, 8]);
      pool.exec(add, [9, 0]);

      assert.equal(pool.maxWorkers, 2);
      assert.equal(pool.workers.length, 2);
      assert.equal(pool.tasks.length, 3);

      pool.clear();
    });

    it('should take number of cpus minus one as default maxWorkers', function () {
      var pool = new Pool();

      var cpus = require('os').cpus();
      assert.equal(pool.maxWorkers, cpus.length - 1);

      pool.clear();
    });

  });

  it.skip('should handle crashed workers (2)', function (done) {
    // TODO: create a worker from a script, which really crashes itself
  });

  it('should clear all workers', function (done) {
    var pool = new Pool({maxWorkers: 10});

    assert.equal(pool.workers.length, 0);

    function test() {
      return 'ok';
    }

    pool.exec(test)
        .then(function (result) {
          assert.equal(result, 'ok');

          assert.equal(pool.workers.length, 1);

          pool.clear();

          assert.equal(pool.workers.length, 0);

          done();
        });

    assert.equal(pool.workers.length, 1);
  });

  it('should clear all workers after tasks are finished', function (done) {
    var pool = new Pool({maxWorkers: 10});

    assert.equal(pool.workers.length, 0);

    function test() {
      return 'ok';
    }

    pool.exec(test)
        .then(function (result) {
          assert.equal(result, 'ok');

          assert.equal(pool.workers.length, 0);

          done();
        });

    assert.equal(pool.workers.length, 1);

    pool.clear();

    assert.equal(pool.workers.length, 0);
  });

  it('should throw an error in case of wrong type of arguments in function exec', function () {
    var pool = new Pool();
    assert.throws(function () {pool.exec()}, TypeError);
    assert.throws(function () {pool.exec(23)}, TypeError);
    assert.throws(function () {pool.exec(add, {})}, TypeError);
    assert.throws(function () {pool.exec(add, 2, 3)}, TypeError);
    assert.throws(function () {pool.exec(add, 'a string')}, TypeError);
  });

});
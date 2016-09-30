var assert = require('assert'),
    Promise = require('../lib/Promise'),
    WorkerHandler = require('../lib/WorkerHandler');

function add(a, b) {
  return a + b;
}

describe('WorkerHandler', function () {

  it('should handle a request', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.equal(result, 6);
          done();
        })
  });

  it('should get all methods', function (done) {
    var handler = new WorkerHandler();

    handler.methods()
        .then(function (methods) {
          assert.deepEqual(methods.sort(), ['methods', 'run']);
          done();
        })
  });

  it('should handle multiple requests at once', function (done) {
    var handler = new WorkerHandler();

    var task1 = handler.exec('run', [add + '', [2, 4]]);
    var task2 = handler.exec('run', [add + '', [4, 7]]);

    Promise.all([task1, task2])
        .then(function (results) {
          assert.deepEqual(results, [6, 11]);
          done();
        })
  });

  it('should test whether a worker is available', function (done) {
    var handler = new WorkerHandler();

    assert.equal(handler.busy(), false);

    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.equal(result, 6);
          assert.equal(handler.busy(), false);
          done();
        });

    assert.equal(handler.busy(), true);

  });

  it('should terminate', function () {
    var handler = new WorkerHandler();

    handler.terminate();

    assert.equal(handler.terminated, true);
  });

  it('should terminate after finishing running requests', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.equal(result, 6);

          assert.equal(handler.terminating, false);
          assert.equal(handler.terminated, true);

          done();
        });

    handler.terminate();

    assert.equal(handler.terminating, true);
    assert.equal(handler.terminated, false);
  });

  it('should force termination without finishing running requests', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
        /*
        .then(function (result) {
          assert('Should not complete request');
        })
        */
        .catch(function (err) {
          assert.ok(err.stack.match(/Error: Worker terminated/))
          done();
        });

    var force = true;
    handler.terminate(force);

    assert.equal(handler.terminated, true);
  });

  it('handle a promise based result', function (done) {
    var handler = new WorkerHandler();

    function asyncAdd(a, b) {
      var Promise = require('../lib/Promise');

      return new Promise(function (resolve, reject) {
        if (typeof a === 'number' && typeof b === 'number') {
          resolve(a + b);
        }
        else {
          reject(new TypeError('Invalid input, two numbers expected'))
        }
      });
    }

    handler.exec('run', [String(asyncAdd), [2, 4]])
        .then(function (result) {
          assert.equal(result, 6);

          handler.exec('run', [String(asyncAdd), [2, 'oops']])
              .catch(function (err) {
                assert.ok(err.stack.match(/TypeError: Invalid input, two numbers expected/))
                done();
              });
        });
  });

  it('create a worker handler with custom script', function (done) {
    var handler = new WorkerHandler(__dirname + '/workers/simple.js');

    // test build in function run
    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.equal(result, 6);

          // test one of the functions defined in the simple.js worker
          handler.exec('multiply', [2, 4])
              .then(function (result) {
                assert.equal(result, 8);

                done();
              });
        });
  });

  it('should handle the asynchronous initialization of a worker', function (done) {

    var handler = new WorkerHandler(__dirname + '/workers/async.js');

      handler.exec('add', [2, 4])
        .then(function (result) {
          assert.equal(result, 6);
          done();
        });
  });

  it('should cancel a task', function (done) {
    var handler = new WorkerHandler();

    function forever() {
      while(1 > 0) {
        // whoops... infinite loop...
      }
    }

    var promise = handler.exec('run', [String(forever)])
        .then(function (result) {
          assert('promise should never resolve');
        })
        //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert.ok(err.stack.match(/CancellationError/))

          assert.equal(handler.worker, null);
          assert.equal(handler.terminated, true);

          done();
        });

    // cancel the task
    promise.cancel();
  });

  it('should timeout a task', function (done) {
    var handler = new WorkerHandler();

    function forever() {
      while(1 > 0) {
        // whoops... infinite loop...
      }
    }

    handler.exec('run', [String(forever)])
        .timeout(50)
        .then(function (result) {
          assert('promise should never resolve');
        })
        //.catch(Promise.TimeoutError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);

          assert.equal(handler.worker, null);
          assert.equal(handler.terminated, true);

          done();
        });
  });

  it('should handle errors thrown by a worker (1)', function (done) {
    var handler = new WorkerHandler();

    function test() {
      throw new TypeError('Test error');
    }

    handler.exec('run', [String(test)])
        .catch(function (err) {
          assert.ok(err.stack.match(/TypeError: Test error/))

          done();
        });
  });

  it('should handle errors thrown by a worker (2)', function (done) {
    var handler = new WorkerHandler();

    function test() {
      return test();
    }

    handler.exec('run', [String(test)])
        .catch(function (err) {
          assert.ok(err.stack.match(/RangeError: Maximum call stack size exceeded/))

          done();
        });
  });

  it('should handle crashing of a worker (1)', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
        .then(function () {
          assert('Promise should not be resolved');
        })
        .catch(function (err) {
          assert(err instanceof Error);
          assert.ok(err.stack.match(/Error: Worker terminated unexpectedly/));

          done();
        });

    // to fake a problem with a worker, we disconnect it
    handler.worker.disconnect();
  });

  it('should handle crashing of a worker (2)', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
        .then(function () {
          assert('Promise should not be resolved');
        })
        .catch(function (err) {
          assert(err instanceof Error);
          assert.ok(err.stack.match(/Error: Worker terminated unexpectedly/));

          done();
        });

    // to fake a problem with a worker, we kill it
    handler.worker.kill();

  });

  it.skip('should handle crashing of a worker (3)', function (done) {
    // TODO: create a worker from a script, which really crashes itself
  });

});

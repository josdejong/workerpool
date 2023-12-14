var assert = require('assert');
var {Promise} = require('../src/Promise');
var WorkerHandler = require('../src/WorkerHandler');
var path = require('path');
var childProcess = require('child_process');
var findProcess = require('find-process');
const { CancellationError } = Promise;

function add(a, b) {
  return a + b;
}

describe('WorkerHandler', function () {

  it('should handle a request', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.strictEqual(result, 6);

          handler.terminate();
          done();
        })
  });

  it('should get all methods', function (done) {
    var handler = new WorkerHandler();

    handler.methods()
        .then(function (methods) {
          assert.deepStrictEqual(methods.sort(), ['methods', 'run']);

          handler.terminate();
          done();
        })
  });

  it('should handle multiple requests at once', function (done) {
    var handler = new WorkerHandler();

    var task1 = handler.exec('run', [add + '', [2, 4]]);
    var task2 = handler.exec('run', [add + '', [4, 7]]);

    Promise.all([task1, task2])
        .then(function (results) {
          assert.deepStrictEqual(results, [6, 11]);

          handler.terminate();
          done();
        })
  });

  it('should test whether a worker is available', function (done) {
    var handler = new WorkerHandler();

    assert.strictEqual(handler.busy(), false);

    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.strictEqual(result, 6);
          assert.strictEqual(handler.busy(), false);

          handler.terminate()
          done();
        });

    assert.strictEqual(handler.busy(), true);

  });

  it('should terminate', function (done) {
    var handler = new WorkerHandler();

    handler.terminate(false, function() {

      assert.strictEqual(handler.terminated, true);
      done();
    })
  });

  it('should terminate after finishing running requests', function (done) {
    var handler = new WorkerHandler();

    var runComplete = false;
    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.strictEqual(result, 6);
          runComplete = true;
        });

    handler.terminate(false, function() {
      assert.ok(runComplete);
      assert.strictEqual(handler.terminating, false);
      assert.strictEqual(handler.terminated, true);

      done();
    });

    assert.strictEqual(handler.terminating, true);
    assert.strictEqual(handler.terminated, false);
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

    assert.strictEqual(handler.terminated, true);
  });

  it('should terminate before the worker is ready', function (done) {
    var handler = new WorkerHandler(__dirname + '/workers/async.js', { workerType: 'process' });
    handler.terminate(true);
    assert.strictEqual(handler.requestQueue[0].message, '__workerpool-terminate__');
    setTimeout(function () {
      assert.strictEqual(handler.terminated, true);
      done();
    }, 100);
  });

  it('handle a promise based result', function (done) {
    var handler = new WorkerHandler();

    function asyncAdd(a, b) {
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
          assert.strictEqual(result, 6);

          handler.exec('run', [String(asyncAdd), [2, 'oops']])
              .catch(function (err) {
                assert.ok(err.stack.match(/TypeError: Invalid input, two numbers expected/));

                handler.terminate();
                done();
              });
        });
  });

  it('create a worker handler with custom script', function (done) {
    var handler = new WorkerHandler(__dirname + '/workers/simple.js');

    // test build in function run
    handler.exec('run', [String(add), [2, 4]])
        .then(function (result) {
          assert.strictEqual(result, 6);

          // test one of the functions defined in the simple.js worker
          handler.exec('multiply', [2, 4])
              .then(function (result) {
                assert.strictEqual(result, 8);

                handler.terminate();
                done();
              });
        });
  });

  it('should handle the asynchronous initialization of a worker', function (done) {

    var handler = new WorkerHandler(__dirname + '/workers/async.js');

      handler.exec('add', [2, 4])
        .then(function (result) {
          assert.strictEqual(result, 6);

          handler.terminate();
          done();
        });
  });

  it('should cancel a task', function () {
    var handler = new WorkerHandler();

    function forever() {
      while(1 > 0) {
        // whoops... infinite loop...
      }
    }

    var promise = handler.exec('run', [String(forever)])
        .then(function () {
          assert('promise should never resolve');
        })
        //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert.ok(err instanceof CancellationError);

          assert.strictEqual(handler.worker, null);
          assert.strictEqual(handler.terminated, true);
        });

    // cancel the task
    promise.cancel();

    return promise;
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
        .then(function () {
          assert('promise should never resolve');
        })
        //.catch(Promise.TimeoutError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);

          assert.strictEqual(handler.worker, null);
          assert.strictEqual(handler.terminated, true);

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

          handler.terminate();
          done();
        });
  });

  it('should handle errors thrown by a worker (2)', function (done) {
    var handler = new WorkerHandler();

    // noinspection InfiniteRecursionJS
    function test() {
      return test();
    }

    handler.exec('run', [String(test)])
        .catch(function (err) {
          assert.ok(err.stack.match(/RangeError: Maximum call stack size exceeded/))

          handler.terminate();
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

          assert.ok(err.toString().match(/Error: Workerpool Worker terminated Unexpectedly/));
          assert.ok(err.toString().match(/exitCode: `.*`/));
          assert.ok(err.toString().match(/signalCode: `.*`/));
          assert.ok(err.toString().match(/workerpool.script: `.*\.js`/));
          assert.ok(err.toString().match(/spawnArgs: `.*\.js`/));
          assert.ok(err.toString().match(/spawnfile: `.*(node|node\.exe)`/));
          assert.ok(err.toString().match(/stdout: `null`/));
          assert.ok(err.toString().match(/stderr: `null`/));
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

          assert.ok(err.stack.match(/Error: Workerpool Worker terminated Unexpectedly/));
          assert.ok(err.stack.match(/exitCode: `.*`/));
          assert.ok(err.stack.match(/signalCode: `.*`/));
          assert.ok(err.stack.match(/workerpool.script: `.*\.js`/));
          assert.ok(err.stack.match(/spawnArgs: `.*\.js`/));
          assert.ok(err.toString().match(/spawnfile: `.*(node|node\.exe)`/));
          assert.ok(err.stack.match(/stdout: `null`/));
          assert.ok(err.stack.match(/stderr: `null`/));

          done();
        });

    // to fake a problem with a worker, we kill it
    handler.worker.kill();

  });

  it.skip('should handle crashing of a worker (3)', function (done) {
    // TODO: create a worker from a script, which really crashes itself
  });

  describe('tryRequireWorkerThreads', function() {
    it('gracefully requires or returns null', function() {
      var workerThreads = WorkerHandler._tryRequireWorkerThreads()

      assert(workerThreads === null || workerThreads === require('worker_threads'));
    });
  });

  // some unit tests, ensuring we correctly  interact with the worker constructors
  // these next tests are mock heavy, this is to ensure they can be tested cross platform with confidence
  describe('setupProcessWorker', function() {
    it('correctly configures a child_process', function() {
      var SCRIPT = 'I AM SCRIPT';
      var FORK_ARGS = {};
      var FORK_OPTS = {};
      var RESULT = {};
      var forkCalls = 0;

      var child_process = {
        fork: function(script, forkArgs, forkOpts) {
          forkCalls++;
          assert.strictEqual(script, SCRIPT);
          assert.strictEqual(forkArgs, FORK_ARGS);
          assert.strictEqual(forkOpts, forkOpts);
          return RESULT;
        }
      };

      assert.strictEqual(WorkerHandler._setupProcessWorker(SCRIPT, {
        forkArgs: FORK_ARGS,
        forkOpts: FORK_OPTS
      }, child_process), RESULT);

      assert.strictEqual(forkCalls, 1);
    });
  });

  describe('setupBrowserWorker', function() {
    it('correctly sets up the browser worker', function() {
      var SCRIPT = 'the script';
      var OPTIONS = { type: 'classic', credentials: 'omit', name: 'testWorker' }; // default WorkerOption values for type and credentials, custom name
      var postMessage;
      var addEventListener;

      function Worker(script, options) {
        assert.strictEqual(script, SCRIPT);
        assert.strictEqual(options, OPTIONS);
      }

      Worker.prototype.addEventListener = function(eventName, callback) {
        addEventListener = { eventName: eventName, callback: callback };
      };

      Worker.prototype.postMessage = function(message) {
        postMessage = message;
      };

      var worker = WorkerHandler._setupBrowserWorker(SCRIPT, OPTIONS, Worker);

      assert.ok(worker instanceof Worker);
      assert.ok(typeof worker.on === 'function');
      assert.ok(typeof worker.send === 'function');

      assert.strictEqual(addEventListener, undefined);
      worker.on('foo', function() {});
      assert.strictEqual(addEventListener.eventName, 'foo');
      assert.ok(typeof addEventListener.callback === 'function');

      assert.strictEqual(postMessage, undefined);
      worker.send('the message');
      assert.strictEqual(postMessage, 'the message');
      worker.send('next message');
      assert.strictEqual(postMessage, 'next message');
    })
  });

  describe('setupWorkerThreadWorker', function() {
    it('works', function() {
      var SCRIPT = 'the script';
      var postMessage;
      var addEventListener;
      var terminate = 0;

      function Worker(script, options) {
        assert.strictEqual(script, SCRIPT);
        assert.strictEqual(options.stdout, false);
        assert.strictEqual(options.stderr, false);
      }

      Worker.prototype.addEventListener = function(eventName, callback) {
        addEventListener = { eventName: eventName, callback: callback };
      };

      Worker.prototype.postMessage = function(message) {
        postMessage = message;
      };

      Worker.prototype.terminate = function() {
        terminate++;
      }

      var worker = WorkerHandler._setupWorkerThreadWorker(SCRIPT, { Worker: Worker });

      assert.ok(worker instanceof Worker);

      // assert.ok(typeof worker.on === 'function');
      assert.ok(typeof worker.send === 'function');
      assert.ok(typeof worker.kill === 'function');
      assert.ok(typeof worker.disconnect === 'function');

      assert.strictEqual(terminate, 0);
      worker.kill();
      assert.strictEqual(terminate, 1);
      worker.disconnect();
      assert.strictEqual(terminate, 2);

      assert.strictEqual(postMessage, undefined);
      worker.send('the message');
      assert.strictEqual(postMessage, 'the message');
      worker.send('next message');
      assert.strictEqual(postMessage, 'next message');
    });
  });

  describe('workerGracefulExit', function () {
    it('worker exit after master is killed', function (done) {
      var child = childProcess.fork(path.join(__dirname, './forkToKill/common.js'));
      child.on('message', function (message) {
        // workerId is the worker process' id which should exit after master is killed
        var workerPid = message.workerPid;
        // kill pool
        child.kill('SIGKILL');
        setTimeout(function () {
          findProcess('pid', workerPid).then(function (list) {
            if (list && list.length > 0) {
              done('Worker not exit');
            } else {
              done();
            }
          })
        }, 100);
      });
    });
  });

  describe('workerAlreadyTerminated', function () {
    it('worker handler checks if terminated before handling message', function (done) {
      var handler = new WorkerHandler();
      const worker = handler.worker;
      handler.terminate(true, () => {
        worker.emit('message', 'ready');
        done();
      });
    });
  });

  describe('terminateAndNotify', function () {

    it('promise should be resolved on termination', function (done) {
      var handler = new WorkerHandler(__dirname + '/workers/async.js');

      handler.terminateAndNotify(true)
      .then(function () {
        done();
      }).catch(function (err) {
        assert('Promise should not be rejected');
      });
    });

    it('promise should be rejected if notify timeout is smaller than worker timeout', function (done) {
      var handler = new WorkerHandler(__dirname + '/workers/async.js', {
        workerTerminateTimeout: 100
      });

      handler.terminateAndNotify(true, 50)
      .then(function () {
        assert('Promise should not be resolved');
      }).catch(function (err) {
        assert.ok(err instanceof Promise.TimeoutError);
        done();
      });
    });
  });
});

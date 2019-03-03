const assert = require('assert');
const Promise = require('../lib/Promise');
const WorkerHandler = require('../lib/WorkerHandler');

describe('WorkerHandler', function() {
  it('should handle a request', function(done) {
    const handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
      .then((result) => {
        assert.equal(result, 6);

        done();
      })
  });

  it('should get all methods', function(done) {
    const handler = new WorkerHandler();

    handler.methods()
      .then((methods) => {
        assert.deepEqual(methods.sort(), ['methods', 'run']);

        done();
      })
  });

  it('should handle multiple requests at once', function(done) {
    const handler = new WorkerHandler();

    const task1 = handler.exec('run', [add + '', [2, 4]]);
    const task2 = handler.exec('run', [add + '', [4, 7]]);

    Promise.all([task1, task2])
      .then((results) => {
        assert.deepEqual(results, [6, 11]);

        done();
      })
  });

  it('should test whether a worker is available', function(done) {
    const handler = new WorkerHandler();

    assert.equal(handler.busy(), false);

    handler.exec('run', [String(add), [2, 4]])
      .then((result) => {
        assert.equal(result, 6);
        assert.equal(handler.busy(), false);

        done();
      });

    assert.equal(handler.busy(), true);

  });

  it('should terminate', function() {
    const handler = new WorkerHandler();

    handler.terminate();

    assert.equal(handler.terminated, true);
  });

  it('should terminate after finishing running requests', function(done) {
    const handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
      .then((result) => {
        assert.equal(result, 6);
        assert.equal(handler.terminating, false);
        assert.equal(handler.terminated, true);

        done();
      });

    handler.terminate();

    assert.equal(handler.terminating, true);
    assert.equal(handler.terminated, false);
  });

  it('should force termination without finishing running requests', function(done) {
    const handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
      /*
      .then(function (result) {
        assert('Should not complete request');
      })
      */
      .catch((err) => {
        assert.ok(err.stack.match(/Error: Worker terminated/))

        done();
      });

    let force = true;

    handler.terminate(force);

    assert.equal(handler.terminated, true);
  });

  it('handle a promise based result', function(done) {
    const handler = new WorkerHandler();

    function asyncAdd(a, b) {
      const Promise = require('../lib/Promise');

      return new Promise((resolve, reject) => {
        if (typeof a === 'number' && typeof b === 'number') {
          resolve(a + b);
        } else {
          reject(new TypeError('Invalid input, two numbers expected'))
        }
      });
    }

    handler.exec('run', [String(asyncAdd), [2, 4]])
      .then((result) => {
        assert.equal(result, 6);

        handler.exec('run', [String(asyncAdd), [2, 'oops']])
          .catch((err) => {
            assert.ok(err.stack.match(/TypeError: Invalid input, two numbers expected/))

            done();
          });
      });
  });

  it('create a worker handler with custom script', function(done) {
    const handler = new WorkerHandler(__dirname + '/workers/simple.js');

    // test build in function run
    handler.exec('run', [String(add), [2, 4]])
      .then((result) => {
        assert.equal(result, 6);

        // test one of the functions defined in the simple.js worker
        handler.exec('multiply', [2, 4])
          .then((result) => {
            assert.equal(result, 8);

            done();
          });
      });
  });

  it('should handle the asynchronous initialization of a worker', function(done) {
    const handler = new WorkerHandler(__dirname + '/workers/async.js');

    handler.exec('add', [2, 4])
      .then((result) => {
        assert.equal(result, 6);

        done();
      });
  });

  it('should cancel a task', function(done) {
    const handler = new WorkerHandler();

    function forever() {
      while(1 > 0) {
        // whoops... infinite loop...
      }
    }

    const promise = handler.exec('run', [String(forever)])
      .then((result) => {
        assert('promise should never resolve');
      })
      //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
      .catch((err) => {
        assert.ok(err.stack.match(/CancellationError/))

        assert.equal(handler.worker, null);
        assert.equal(handler.terminated, true);

        done();
      });

    // cancel the task
    promise.cancel();
  });

  it('should timeout a task', function(done) {
    const handler = new WorkerHandler();

    function forever() {
      while(1 > 0) {
        // whoops... infinite loop...
      }
    }

    handler.exec('run', [String(forever)])
        .timeout(50)
        .then((result) => {
          assert('promise should never resolve');
        })
        //.catch(Promise.TimeoutError, function (err) { // TODO: not yet supported
        .catch((err) => {
          assert(err instanceof Promise.TimeoutError);
          assert.equal(handler.worker, null);
          assert.equal(handler.terminated, true);

          done();
        });
  });

  it('should handle errors thrown by a worker (1)', function(done) {
    const handler = new WorkerHandler();

    function test() {
      throw new TypeError('Test error');
    }

    handler.exec('run', [String(test)])
      .catch((err) => {
        assert.ok(err.stack.match(/TypeError: Test error/))

        done();
      });
  });

  it('should handle errors thrown by a worker (2)', function(done) {
    const handler = new WorkerHandler();

    function test() {
      return test();
    }

    handler.exec('run', [String(test)])
      .catch((err) => {
        assert.ok(err.stack.match(/RangeError: Maximum call stack size exceeded/))

        done();
      });
  });

  it('should handle crashing of a worker (1)', function(done) {
    const handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
      .then(() => {
        assert('Promise should not be resolved');
      })
      .catch((err) => {
        assert(err instanceof Error);
        assert.ok(err.stack.match(/Error: Worker terminated unexpectedly/));

        done();
      });

    // to fake a problem with a worker, we disconnect it
    handler.worker.disconnect();
  });

  it('should handle crashing of a worker (2)', function(done) {
    const handler = new WorkerHandler();

    handler.exec('run', [String(add), [2, 4]])
      .then(() => {
        assert('Promise should not be resolved');
      })
      .catch((err) => {
        assert(err instanceof Error);
        assert.ok(err.stack.match(/Error: Worker terminated unexpectedly/));

        done();
      });

    // to fake a problem with a worker, we kill it
    handler.worker.kill();
  });

  it.skip('should handle crashing of a worker (3)', function(done) {
    // TODO: create a worker from a script, which really crashes itself
  });

  describe('tryRequire', function() {
    it('gracefully requires or returns null', function() {
      assert.equal(WorkerHandler._tryRequire('nope-nope-missing---never-exists'), null);
      assert.equal(WorkerHandler._tryRequire('fs'), require('fs'));
    });
  });

  // some unit tests, ensuring we correctly  interact with the worker constructors
  // these next tests are mock heavy, this is to ensure they can be tested cross platform with confidence
  describe('setupProcessWorker', function() {
    it('correctly configures a child_process', function() {
      const SCRIPT = 'I AM SCRIPT';
      const FORK_ARGS = {};
      const FORK_OPTS = {};
      let RESULT = {};
      let forkCalls = 0;

      const child_process = {
        fork(script, forkArgs, forkOpts) {
          forkCalls++;

          assert.equal(script, SCRIPT);
          assert.equal(forkArgs, FORK_ARGS);
          assert.equal(forkOpts, forkOpts);

          return RESULT;
        }
      };

      assert.equal(WorkerHandler._setupProcessWorker(SCRIPT, {
        forkArgs: FORK_ARGS,
        forkOpts: FORK_OPTS
      }, child_process), RESULT);
      assert.equal(forkCalls, 1);
    });
  });

  describe('setupBrowserWorker', function() {
    it('correctly sets up the browser worker', function() {
      const SCRIPT = 'the script';
      let postMessage;
      let addEventListener;

      function Worker(script) {
        assert.equal(script, SCRIPT);
      }

      Worker.prototype.addEventListener = function(eventName, callback) {
        addEventListener = { eventName: eventName, callback: callback };
      };

      Worker.prototype.postMessage = function(message) {
        postMessage = message;
      };

      const worker = WorkerHandler._setupBrowserWorker(SCRIPT, Worker);

      assert.ok(worker instanceof Worker);
      assert.ok(typeof worker.on === 'function');
      assert.ok(typeof worker.send === 'function');

      assert.equal(addEventListener, undefined);

      worker.on('foo', function() {});

      assert.equal(addEventListener.eventName, 'foo');
      assert.ok(typeof addEventListener.callback === 'function');
      assert.equal(postMessage, undefined);

      worker.send('the message');

      assert.equal(postMessage, 'the message');

      worker.send('next message');

      assert.equal(postMessage, 'next message');
    })
  });

  describe('setupWorkerThreadWorker', function() {
    it('works', function() {
      const SCRIPT = 'the script';
      let postMessage;
      let addEventListener;
      let terminate = 0;

      function Worker(script, options) {
        assert.equal(script, SCRIPT);
        assert.equal(options.stdout, false);
        assert.equal(options.stderr, false);
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

      const worker = WorkerHandler._setupWorkerThreadWorker(SCRIPT, { Worker: Worker });

      assert.ok(worker instanceof Worker);

      // assert.ok(typeof worker.on === 'function');
      assert.ok(typeof worker.send === 'function');
      assert.ok(typeof worker.kill === 'function');
      assert.ok(typeof worker.disconnect === 'function');
      assert.equal(terminate, 0);

      worker.kill();

      assert.equal(terminate, 1);

      worker.disconnect();

      assert.equal(terminate, 2);
      assert.equal(postMessage, undefined);

      worker.send('the message');

      assert.equal(postMessage, 'the message');

      worker.send('next message');

      assert.equal(postMessage, 'next message');
    });
  });
});

function add(a, b) {
  return a + b;
}

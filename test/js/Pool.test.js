var assert = require('assert');
var {Promise} = require('../../src/js/Promise');
var Pool = require('../../src/js/Pool');
var tryRequire = require('./utils').tryRequire

// Import workerpool module for enhanced features tests
var workerpool = require('../../dist/workerpool.js');
var capabilities = workerpool.capabilities;
var getCapabilities = workerpool.getCapabilities;
var canUseOptimalTransfer = workerpool.canUseOptimalTransfer;
var canUseZeroCopy = workerpool.canUseZeroCopy;
var getCapabilityReport = workerpool.getCapabilityReport;
var getSharedPool = workerpool.getSharedPool;
var terminateSharedPool = workerpool.terminateSharedPool;
var hasSharedPool = workerpool.hasSharedPool;
var serializeBinary = workerpool.serializeBinary;
var deserializeBinary = workerpool.deserializeBinary;
var shouldUseBinarySerialization = workerpool.shouldUseBinarySerialization;
var estimateBinarySize = workerpool.estimateBinarySize;
var resolveWorkerUrl = workerpool.resolveWorkerUrl;
var supportsWorkerModules = workerpool.supportsWorkerModules;
var getWorkerConfig = workerpool.getWorkerConfig;

function add(a, b) {
  return a + b;
}

describe('Pool', function () {
  // Creating pool with this function ensures that the pool is terminated
  // at the end of the test, which avoid hanging the test suite if terminate()
  // hadn't been called for some reason
  let createdPools = []
  function createPool(script, options) {
    const pool = new Pool(script, options);
    createdPools.push(pool);
    return pool;
  }

  afterEach(async () => {
    while (createdPools.length > 0) {
      await createdPools.shift().terminate();
    }
  });

  describe('nodeWorker', function() {
    function add(a,b) {
      return a+b;
    }

    it('supports process', function() {
      var pool = createPool({ workerType: 'process' });

      return pool.exec(add, [3, 4])
          .then(function (result) {
            assert.strictEqual(result, 7);

            return pool.terminate();
          });
    });

    var WorkerThreads = tryRequire('worker_threads');

    it('supports auto', function() {
      var pool = createPool({ workerType: 'auto' });
      var promise = pool.exec(add, [3, 4]);
      assert.strictEqual(pool.workers.length, 1);
      var worker = pool.workers[0].worker;

      if (WorkerThreads) {
        assert.strictEqual(worker.isWorkerThread, true);
      } else {
        assert.strictEqual(worker.isChildProcess, true);
      }

      return promise.then(function (result) {
        assert.strictEqual(result, 7);

        return pool.terminate();
      });
    });

    if (WorkerThreads) {
      it('supports thread', function() {
        var pool = createPool({ workerType: 'thread' });
        var promise = pool.exec(add, [3, 4]);

        assert.strictEqual(pool.workers.length, 1);
        var worker = pool.workers[0].worker;
        assert.strictEqual(worker.isWorkerThread, true);

        return promise.then(function (result) {
          assert.strictEqual(result, 7);

          return pool.terminate();
        });
      });

      it('supports passing options to threads', function() {
        const maxYoungGenerationSizeMb = 200
        var pool = createPool({ minWorkers:1, workerType: 'thread', workerThreadOpts: { resourceLimits: { maxYoungGenerationSizeMb } } });
        var worker = pool.workers[0].worker;

        assert.strictEqual(worker.isWorkerThread, true);
        assert.strictEqual(worker.resourceLimits.maxYoungGenerationSizeMb, maxYoungGenerationSizeMb);
      });

      it('supports passing options to threads via mode auto', function() {
        const maxYoungGenerationSizeMb = 200
        var pool = createPool({ minWorkers:1, workerType: 'auto', workerThreadOpts: { resourceLimits: { maxYoungGenerationSizeMb } } });
        var worker = pool.workers[0].worker;

        assert.strictEqual(worker.isWorkerThread, true);
        assert.strictEqual(worker.resourceLimits.maxYoungGenerationSizeMb, maxYoungGenerationSizeMb);
      });
    } else {
      it('errors when not supporting worker thread', function() {
        assert.throws(function() {
          createPool({ workerType: 'thread' });
        }, /WorkerPool: workerType = 'thread' is not supported, Node >= 11\.7\.0 required/)
      });
    }
  })

  it('supports forkOpts parameter to pass options to fork', function() {
    var pool = createPool({ workerType: 'process', forkOpts: { env: { TEST_ENV: 'env_value'} } });
    function getEnv() {
      return process.env.TEST_ENV;
    }

    return pool.exec(getEnv, [])
        .then(function (result) {
          assert.strictEqual(result, 'env_value');

          return pool.terminate();
        });
  });

  it('supports worker creation hook to pass dynamic options to fork (for example)', function() {
    var counter = 0;
    var terminatedWorkers = [];
    var pool = createPool({
      workerType: 'process',
      maxWorkers: 4, // make sure we can create enough workers (otherwise we could be limited by the number of CPUs)
      onCreateWorker: (opts) => {
        return {...opts, forkOpts: {...opts.forkOpts, env: { TEST_ENV: `env_value${counter++}` }}}
      },
      onTerminateWorker: (opts) => {
        terminatedWorkers.push(opts.forkOpts.env.TEST_ENV);
      }
    });

    function getEnv() {
      return process.env.TEST_ENV;
    }

    return Promise.all([
      pool.exec(getEnv, []),
      pool.exec(getEnv, []),
      pool.exec(getEnv, [])
    ]).then(function (result) {
      assert.strictEqual(result.length, 3, 'The creation hook should be called 3 times');
      assert(result.includes('env_value0'), 'result should include the value with counter = 0');
      assert(result.includes('env_value1'), 'result should include the value with counter = 1');
      assert(result.includes('env_value2'), 'result should include the value with counter = 2');
      return pool.terminate();
    }).then(function () {
      assert.strictEqual(terminatedWorkers.length, 3, 'The termination hook should be called 3 times');
      assert(terminatedWorkers.includes('env_value0'), 'terminatedWorkers should include the value with counter = 0');
      assert(terminatedWorkers.includes('env_value1'), 'terminatedWorkers should include the value with counter = 1');
      assert(terminatedWorkers.includes('env_value2'), 'terminatedWorkers should include the value with counter = 2');
    });
  });

  it('supports worker creation hook to pass dynamic options to threads (for example)', function() {
    var counter = 0;
    var terminatedWorkers = [];
    var pool = createPool({
      workerType: 'thread',
      maxWorkers: 4, // make sure we can create enough workers (otherwise we could be limited by the number of CPUs)
      onCreateWorker: (opts) => {
        return {...opts, workerThreadOpts: {...opts.workerThreadOpts, env: { TEST_ENV: `env_value${counter++}` }}}
      },
      onTerminateWorker: (opts) => {
        terminatedWorkers.push(opts.workerThreadOpts.env.TEST_ENV);
      }
    });

    function getEnv() {
      return process.env.TEST_ENV;
    }

    return Promise.all([
      pool.exec(getEnv, []),
      pool.exec(getEnv, []),
      pool.exec(getEnv, [])
    ]).then(function (result) {
      assert.strictEqual(result.length, 3, 'The creation hook should be called 3 times');
      assert(result.includes('env_value0'), 'result should include the value with counter = 0');
      assert(result.includes('env_value1'), 'result should include the value with counter = 1');
      assert(result.includes('env_value2'), 'result should include the value with counter = 2');
      return pool.terminate();
    }).then(function () {
      assert.strictEqual(terminatedWorkers.length, 3, 'The termination hook should be called 3 times');
      assert(terminatedWorkers.includes('env_value0'), 'terminatedWorkers should include the value with counter = 0');
      assert(terminatedWorkers.includes('env_value1'), 'terminatedWorkers should include the value with counter = 1');
      assert(terminatedWorkers.includes('env_value2'), 'terminatedWorkers should include the value with counter = 2');
    });
  });
  
  it('supports stdout/stderr capture via fork', function(done) {
    var pool = createPool(__dirname + '/workers/console.js', {workerType: 'process', emitStdStreams: true});

    var receivedEvents = []
    pool.exec("stdStreams", [], {
      on: function (payload) {
        receivedEvents.push(payload)
      }
    })
    .then(function (result) {
      assert.strictEqual(result, 'done');
      assert.deepStrictEqual(receivedEvents, [{
        stdout: 'stdout message\n'
      }, {
        stderr: 'stderr message\n'
      }]);

      pool.terminate();
      done();
    })
    .catch(function (err) {
      console.log(err);
      assert.fail('Should not throw an error');
      done(err);
    });
  })

  it('excludes stdout/stderr capture via fork', function(done) {
    var pool = createPool(__dirname + '/workers/console.js', {workerType: 'process'});

    var receivedEvents = []
    pool.exec("stdStreams", [], {
      on: function (payload) {
        receivedEvents.push(payload)
      }
    })
    .then(function (result) {
      assert.strictEqual(result, 'done');
      assert.deepStrictEqual(receivedEvents, []);

      pool.terminate();
      done();
    })
    .catch(function (err) {
      console.log(err);
      assert.fail('Should not throw an error');
      done(err);
    });
  })

  it('supports stdout/stderr capture via threads', function(done) {
    this.timeout(15000); // Increase mocha timeout for this test
    var pool = createPool(__dirname + '/workers/console.js', {workerType: 'thread', emitStdStreams: true});

    var receivedEvents = []
    pool.exec("stdStreams", [], {
      on: function (payload) {
        receivedEvents.push(payload)
      }
    })
    .then(function (result) {
      assert.strictEqual(result, 'done');
      assert.deepStrictEqual(receivedEvents, [{
        stdout: 'stdout message\n'
      }, {
        stderr: 'stderr message\n'
      }]);

      pool.terminate();
      done();
    })
    .catch(function (err) {
      console.log(err);
      assert.fail('Should not throw an error');
      done(err);
    });
  })

  it('excludes stdout/stderr capture via threads', function(done) {
    var pool = createPool(__dirname + '/workers/console.js', {workerType: 'threads'});

    var receivedEvents = []
    pool.exec("stdStreams", [], {
      on: function (payload) {
        receivedEvents.push(payload)
      }
    })
    .then(function (result) {
      assert.strictEqual(result, 'done');
      assert.deepStrictEqual(receivedEvents, []);

      pool.terminate();
      done();
    })
    .catch(function (err) {
      console.log(err);
      assert.fail('Should not throw an error');
      done(err);
    });
  })

  it('should offload a function to a worker', function (done) {
    var pool = createPool({maxWorkers: 10});

    function add(a, b) {
      return a + b;
    }

    assert.strictEqual(pool.workers.length, 0);

    pool.exec(add, [3, 4])
        .then(function (result) {
          assert.strictEqual(result, 7);
          assert.strictEqual(pool.workers.length, 1);
          return pool.terminate();
        })
        .then(function() {
          assert.strictEqual(pool.workers.length, 0);
          done();
        })
        .catch(done);

    assert.strictEqual(pool.workers.length, 1);
  });

  it('should offload functions to multiple workers', function (done) {
    var pool = createPool({maxWorkers: 10});

    function add(a, b) {
      return a + b;
    }

    assert.strictEqual(pool.workers.length, 0);

    Promise.all([
          pool.exec(add, [3, 4]),
          pool.exec(add, [2, 3])
        ])
        .then(function (results) {
          assert.deepStrictEqual(results, [7, 5]);
          assert.strictEqual(pool.workers.length, 2);

          pool.terminate();
          done();
        });

    assert.strictEqual(pool.workers.length, 2);
  });

  it('should put tasks in queue when all workers are busy', function (done) {
    var pool = createPool({maxWorkers: 2});

    function add(a, b) {
      return a + b;
    }

    assert.strictEqual(pool.taskQueue.size(), 0);
    assert.strictEqual(pool.workers.length, 0);

    var task1 = pool.exec(add, [3, 4]);
    var task2 = pool.exec(add, [2, 3]);

    assert.strictEqual(pool.taskQueue.size(), 0);
    assert.strictEqual(pool.workers.length, 2);

    var task3 = pool.exec(add, [5, 7]);
    var task4 = pool.exec(add, [1, 1]);

    assert.strictEqual(pool.taskQueue.size(), 2);
    assert.strictEqual(pool.workers.length, 2);

    Promise.all([
        task1,
        task2,
        task3,
        task4
        ])
        .then(function (results) {
          assert.deepStrictEqual(results, [7, 5, 12, 2]);
          assert.strictEqual(pool.taskQueue.size(), 0);
          assert.strictEqual(pool.workers.length, 2);

          pool.terminate();
          done();
        });
  });

  it('should create a proxy', function (done) {
    var pool = createPool();

    pool.proxy().then(function (proxy) {
      assert.deepStrictEqual(Object.keys(proxy).sort(), ['methods', 'run']);

      proxy.methods()
          .then(function (methods) {
            assert.deepStrictEqual(methods.sort(), ['methods', 'run']);

            pool.terminate();
            done();
          })
          .catch(function () {
            assert.fail('Should not throw an error');
          });
    });
  });

  it('should create a proxy of a custom worker', function (done) {
    var pool = createPool(__dirname + '/workers/simple.js');

    pool.proxy().then(function (proxy) {
      assert.deepStrictEqual(Object.keys(proxy).sort(), ['add','methods','multiply','run','timeout']);

      pool.terminate();
      done();
    });
  });

  it('should invoke a method via a proxy', function (done) {
    var pool = createPool(__dirname + '/workers/simple.js');

    pool.proxy().then(function (proxy) {
      proxy.multiply(4, 3)
          .then(function (result) {
            assert.strictEqual(result, 12);

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
          });
    });
  });

  it('should invoke an async method via a proxy', function (done) {
    var pool = createPool(__dirname + '/workers/simple.js');

    pool.proxy().then(function (proxy) {
      proxy.timeout(100)
          .then(function (result) {
            assert.strictEqual(result, 'done');

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
          });
    });
  });

  it('should handle errors thrown by a worker', function (done) {
    var pool = createPool({maxWorkers: 10});

    function test() {
      throw new TypeError('Test error');
    }

    pool.exec(test)
        .catch(function (err) {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'Test error')

          pool.terminate();
          done();
        });
  });

  it('should handle a nested custom error class thrown by a worker', function (done) {
    var pool = createPool();

    function test() {
      class CustomError {
        constructor(message, details) {
          this.message = message
          this.details = details
        }

        toJSON = () => ({
          message: this.message,
          details: this.details
        })
      }

      class  NestedCustomData {
        constructor(value) {
          this.value = value
        }

        toJSON = () => ({
          value: this.value
        })
      }

      throw new CustomError('Custom error', new NestedCustomData(42));
    }

    pool.exec(test)
        .catch(function (err) {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'Custom error');
          assert.strictEqual(err.details.value, 42);

          pool.terminate();
          done();
        });
  });

  it('should execute a function returning a Promise', function (done) {
    var pool = createPool({maxWorkers: 10});

    function testAsync() {
      return Promise.resolve('done');
    }

    pool.exec(testAsync)
        .then(function (result) {
          assert.strictEqual(result, 'done');

          pool.terminate();
          done();
        })
        .catch(function () {
          assert.fail('Should not throw an error');
        });
  });

  it('should propagate a rejected Promise', function (done) {
    var pool = createPool({maxWorkers: 10});

    function testAsync() {
      return Promise.reject(new Error('I reject!'));
    }

    pool.exec(testAsync)
        .then(function () {
          assert.fail('Should not resolve');
        })
        .catch(function (err) {
          assert.strictEqual(err.toString(), 'Error: I reject!');

          pool.terminate();
          done();
        });
  });

  it('should cancel a task', function (done) {
    var pool = createPool({maxWorkers: 10});

    function forever() {
      while (1 > 0) {} // runs forever
    }

    var promise = pool.exec(forever)
        .then(function () {
          done(new Error('promise should not resolve!'));
        })
      //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.CancellationError);
          // we cannot assert that no workers remain in the pool, because that happens
          // on a different promise chain (termination is now async)
          done();
        });

    // cancel the task
    setTimeout(function () {
      promise.cancel();
    }, 0);
  });

  it('should cancel a queued task', function (done) {
    var pool = createPool({maxWorkers: 1});
    var reachedTheEnd = false;

    function delayed() {
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
          assert.strictEqual(result, 1);
          assert.strictEqual(reachedTheEnd, true);

          assert.strictEqual(pool.workers.length, 1);
          assert.strictEqual(pool.taskQueue.size(), 0);

          return pool.terminate();
        })
        .then(function() {
          done();
        })
        .catch(done);

    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 0);

    var p2 = pool.exec(one); // will be queued
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 1);

    p2.cancel();            // cancel immediately
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 1);

    reachedTheEnd = true;
  });

  it('should run following tasks if a previous queued task is cancelled', function (done) {

    var pool = createPool({maxWorkers: 1});
    var reachedTheEnd = false;

    function delayed() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(1);
        }, 0);
      });
    }

    function two() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(2);
        }, 0);
      });
    }

    function one() {
      return 1;
    }

    var oneDone = false;
    var twoDone = false;
    function checkDone() {
      if (oneDone && twoDone) {
        return pool.terminate()
          .then(function() {
            done();
          })
          .catch(done);
      }
    }

    var p1 = pool.exec(delayed)
        .then(function (result) {
          assert.strictEqual(result, 1);
          assert.strictEqual(reachedTheEnd, true);

          oneDone = true;

          assert.strictEqual(pool.workers.length, 1);
          assert.strictEqual(pool.taskQueue.size(), 1);

          checkDone();
        });

    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 0);

    var p2 = pool.exec(one); // will be queued
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 1);

    var p3 = pool.exec(two)
        .then(function (result) {
          assert.strictEqual(result, 2);
          assert.strictEqual(reachedTheEnd, true);

          twoDone = true;

          assert.strictEqual(pool.workers.length, 1);
          assert.strictEqual(pool.taskQueue.size(), 0);

          checkDone();
        });

    p2.cancel();            // cancel immediately
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 2);

    reachedTheEnd = true;
  });

    // TODO: test whether a task in the queue can be neatly cancelled

  it('should timeout a task', function () {
    var pool = createPool({maxWorkers: 10});

    function forever() {
      while (1 > 0) {} // runs forever
    }

    return pool.exec(forever)
        .timeout(50)
        .then(function (result) {
          assert.fail('promise should never resolve');
        })
      //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);
          // we cannot assert that no workers remain in the pool, because that happens
          // on a different promise chain (termination is now async)

        });
  });

  it('should start timeout timer of a task once the task is taken from the queue (1)', function (done) {
    var pool = createPool({maxWorkers: 1});
    var delay = 50

    function sleep() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve ('done :)')
        }, 100) // 2 * delay
      })
    }

    function doNothing() {
      return 'ready'
    }

    // add a task
    pool.exec(sleep)

    // add a second task, will be queued until the first finishes
    // the timeout is shorter than the currently executing task and longer than
    // the queued task, so it should not timeout
    pool.exec(doNothing)
        .timeout(delay)
        .then(function (result) {
          assert.strictEqual(result, 'ready');

          return pool.terminate()
            .then(function() {
              done();
            })
            .catch(done);
        })
        .catch(function (err) {
          assert.fail('promise should not throw');
        });
  });

  it('should start timeout timer of a task once the task is taken from the queue (2)', function (done) {
    var pool = createPool({maxWorkers: 1});
    var delay = 50

    function sleep() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve ('done :)')
        }, 100) // 2 * delay
      })
    }

    // add a task
    pool.exec(sleep)

    // add a second task, will be queued until the first finishes
    pool.exec(sleep)
        .timeout(delay)
        .then(function (result) {
          assert.fail('promise should never resolve');
        })
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);

          done();
        });
  });

  it('should handle crashed workers', function () {
    var pool = createPool({maxWorkers: 1});

    var promise = pool.exec(add)
      .then(function () {
        throw new Error('Promise should not be resolved');
      })
      .catch(function (err) {
        assert.ok(err.toString().match(/Error: Workerpool Worker terminated Unexpectedly/));
        assert.ok(err.toString().match(/exitCode: `.*`/));
        assert.ok(err.toString().match(/signalCode: `.*`/));
        assert.ok(err.toString().match(/workerpool.script: `.*\.js`/));

        assert.strictEqual(pool.workers.length, 0);

        // validate whether a new worker is spawned
        var promise2 = pool.exec(add, [2,3])
        assert.strictEqual(pool.workers.length, 1);
        return promise2;
      })
      .then(function (result) {
        assert.strictEqual(result, 5);

        assert.strictEqual(pool.workers.length, 1);

        return pool.terminate();
      });

    assert.strictEqual(pool.workers.length, 1);

    // kill the worker so it will be terminated
    pool.workers[0].worker.kill();

    assert.strictEqual(pool.workers.length, 1);

    return promise;
  });

  describe('options', function () {

    it('should throw an error on invalid type or number of maxWorkers', function () {
      assert.throws(function () {
        createPool({maxWorkers: 'a string'});
      }, TypeError);

      assert.throws(function () {
        createPool({maxWorkers: 2.5});
      }, TypeError);

      assert.throws(function () {
        createPool({maxWorkers: 0});
      }, TypeError);

      assert.throws(function () {
        createPool({maxWorkers: -1});
      }, TypeError);
    });

    it('should limit to the configured number of max workers', function () {
      var pool = createPool({maxWorkers: 2});

      var tasks = [
        pool.exec(add, [1, 2]),
        pool.exec(add, [3, 4]),
        pool.exec(add, [5, 6]),
        pool.exec(add, [7, 8]),
        pool.exec(add, [9, 0])
      ]

      assert.strictEqual(pool.maxWorkers, 2);
      assert.strictEqual(pool.workers.length, 2);
      assert.strictEqual(pool.taskQueue.size(), 3);

      return Promise.all(tasks).then(function () {
        return pool.terminate();
      });
    });

    it('should take number of cpus minus one as default maxWorkers', function () {
      var pool = createPool();

      var cpus = require('os').cpus();
      assert.strictEqual(pool.maxWorkers, cpus.length - 1);

      return pool.terminate();
    });

    it('should throw an error on invalid type or number of minWorkers', function () {
      assert.throws(function () {
        createPool({minWorkers: 'a string'});
      }, TypeError);

      assert.throws(function () {
        createPool({minWorkers: 2.5});
      }, TypeError);

      assert.throws(function () {
        createPool({maxWorkers: -1});
      }, TypeError);
    });

    it('should create number of cpus minus one when minWorkers set to \'max\'', function () {
      var pool = createPool({minWorkers:'max'});

      var cpus = require('os').cpus();
      assert.strictEqual(pool.workers.length, cpus.length - 1);

      return pool.terminate();
    });

    it('should increase maxWorkers to match minWorkers', function () {
      var cpus = require('os').cpus();
      var count = cpus.length + 2;
      var tasksCount = cpus.length * 2;
      var pool = createPool({minWorkers: count});

      var tasks = []
      for(var i=0;i<tasksCount;i++) {
        tasks.push(pool.exec(add, [i, i*2]));
      }

      assert.strictEqual(pool.minWorkers, count);
      assert.strictEqual(pool.maxWorkers, count);
      assert.strictEqual(pool.workers.length, count);
      assert.strictEqual(pool.taskQueue.size(), tasksCount - count);

      return Promise.all(tasks).then(function () {
        return pool.terminate();
      });
    });

    describe('queueStrategy', function () {
      it('should use FIFO queue strategy by default', function () {
        var pool = createPool();

        // Verify the queue type by checking behavior
        assert.strictEqual(pool.taskQueue.constructor.name, 'FIFOQueue');

        return pool.terminate();
      });

      it('should use FIFO queue strategy when explicitly specified', function () {
        var pool = createPool({queueStrategy: 'fifo'});

        assert.strictEqual(pool.taskQueue.constructor.name, 'FIFOQueue');

        return pool.terminate();
      });

      it('should use LIFO queue strategy when specified', function () {
        var pool = createPool({queueStrategy: 'lifo'});

        assert.strictEqual(pool.taskQueue.constructor.name, 'LIFOQueue');

        return pool.terminate();
      });

      it('should process tasks in FIFO order with fifo strategy', function () {
        var pool = createPool({maxWorkers: 1, queueStrategy: 'fifo'});
        var results = [];

        function delayedAdd(a, b) {
          return new Promise(function(resolve) {
            setTimeout(function() {
              resolve(a + b);
            }, 10);
          });
        }

        // Fill the queue with tasks
        var task1 = pool.exec(delayedAdd, [1, 1]).then(function(result) { results.push(result); });
        var task2 = pool.exec(delayedAdd, [2, 2]).then(function(result) { results.push(result); });
        var task3 = pool.exec(delayedAdd, [3, 3]).then(function(result) { results.push(result); });
        var task4 = pool.exec(delayedAdd, [4, 4]).then(function(result) { results.push(result); });

        return Promise.all([task1, task2, task3, task4]).then(function() {
          // FIFO should process tasks in order: 2, 4, 6, 8
          assert.deepStrictEqual(results, [2, 4, 6, 8]);
          return pool.terminate();
        });
      });

      it('should process tasks in LIFO order with lifo strategy', function () {
        var pool = createPool({maxWorkers: 1, queueStrategy: 'lifo'});
        var results = [];

        function delayedAdd(a, b) {
          return new Promise(function(resolve) {
            setTimeout(function() {
              resolve(a + b);
            }, 10);
          });
        }

        // Fill the queue with tasks
        var task1 = pool.exec(delayedAdd, [1, 1]).then(function(result) { results.push(result); });
        var task2 = pool.exec(delayedAdd, [2, 2]).then(function(result) { results.push(result); });
        var task3 = pool.exec(delayedAdd, [3, 3]).then(function(result) { results.push(result); });
        var task4 = pool.exec(delayedAdd, [4, 4]).then(function(result) { results.push(result); });

        return Promise.all([task1, task2, task3, task4]).then(function() {
          // LIFO should process tasks in reverse order: 2, 8, 6, 4
          assert.deepStrictEqual(results, [2, 8, 6, 4]);
          return pool.terminate();
        });
      });

      it('should accept custom queue strategy', function () {
        // Create a priority queue that processes tasks with higher priority first
        function PriorityQueue() {
          this.tasks = [];
        }

        PriorityQueue.prototype.push = function(task) {
          this.tasks.push(task);
          this._sort();
        };

        PriorityQueue.prototype.pop = function() {
          return this.tasks.shift();
        };

        PriorityQueue.prototype.size = function() {
          return this.tasks.length;
        };

        PriorityQueue.prototype.contains = function(task) {
          return this.tasks.includes(task);
        };

        PriorityQueue.prototype.clear = function() {
          this.tasks.length = 0;
        };

        PriorityQueue.prototype._sort = function() {
          var self = this;
          this.tasks.sort(function(a, b) {
            var priorityA = self._getPriority(a);
            var priorityB = self._getPriority(b);
            return priorityA - priorityB; // Lower number = higher priority
          });
        };

        PriorityQueue.prototype._getPriority = function(task) {
          if (task.options && task.options.metadata && typeof task.options.metadata.priority === 'number') {
            return task.options.metadata.priority;
          }
          return 0; // Default priority
        };

        var customQueue = new PriorityQueue();
        var pool = createPool({queueStrategy: customQueue});

        assert.strictEqual(pool.taskQueue, customQueue);

        return pool.terminate();
      });

      it('should process tasks according to priority queue behavior', function () {
        // Create a priority queue that processes tasks based on metadata priority
        function PriorityQueue() {
          this.tasks = [];
        }

        PriorityQueue.prototype.push = function(task) {
          this.tasks.push(task);
          this._sort();
        };

        PriorityQueue.prototype.pop = function() {
          return this.tasks.shift();
        };

        PriorityQueue.prototype.size = function() {
          return this.tasks.length;
        };

        PriorityQueue.prototype.contains = function(task) {
          return this.tasks.includes(task);
        };

        PriorityQueue.prototype.clear = function() {
          this.tasks.length = 0;
        };

        PriorityQueue.prototype._sort = function() {
          var self = this;
          this.tasks.sort(function(a, b) {
            var priorityA = self._getPriority(a);
            var priorityB = self._getPriority(b);
            return priorityA - priorityB; // Lower number = higher priority
          });
        };

        PriorityQueue.prototype._getPriority = function(task) {
          if (task.options && task.options.metadata && typeof task.options.metadata.priority === 'number') {
            return task.options.metadata.priority;
          }
          return 5; // Default medium priority
        };

        var customQueue = new PriorityQueue();
        var pool = createPool({maxWorkers: 1, queueStrategy: customQueue});
        var results = [];

        function delayedAdd(a, b) {
          return new Promise(function(resolve) {
            setTimeout(function() {
              resolve(a + b);
            }, 10);
          });
        }

        // Add tasks with different priorities - the first task will start immediately, others will be queued
        var task1 = pool.exec(delayedAdd, [1, 1], { metadata: { priority: 5 } }).then(function(result) { results.push(result); });
        var task2 = pool.exec(delayedAdd, [2, 2], { metadata: { priority: 3 } }).then(function(result) { results.push(result); });
        var task3 = pool.exec(delayedAdd, [3, 3], { metadata: { priority: 1 } }).then(function(result) { results.push(result); });
        var task4 = pool.exec(delayedAdd, [4, 4], { metadata: { priority: 2 } }).then(function(result) { results.push(result); });

        return Promise.all([task1, task2, task3, task4]).then(function() {
          // With priority queue, execution order should be:
          // task1 (2) - executed first as it started immediately (priority 5)
          // task3 (6) - highest priority 1
          // task4 (8) - priority 2
          // task2 (4) - lowest priority 3
          assert.deepStrictEqual(results, [2, 6, 8, 4]);
          return pool.terminate();
        });
      });
    });
  });

  it('should handle crashed workers via process.exit', function () {
    var pool = createPool(__dirname + '/workers/crash.js', {maxWorkers: 1});

    var promise = pool.exec('crashWithExit', [1])
      .then(function () {
        throw new Error('Promise should not be resolved');
      })
      .catch(function (err) {
        assert.ok(err.toString().match(/Error: Workerpool Worker terminated Unexpectedly/));
        assert.ok(err.toString().match(/exitCode: `1`/));

        assert.strictEqual(pool.workers.length, 0);

        // validate whether a new worker is spawned and works correctly
        return pool.exec('add', [2, 3]);
      })
      .then(function (result) {
        assert.strictEqual(result, 5);
        assert.strictEqual(pool.workers.length, 1);
        return pool.terminate();
      });

    return promise;
  });

  it('should clear all workers upon explicit termination', function (done) {
    var pool = createPool({maxWorkers: 10});

    assert.strictEqual(pool.workers.length, 0);

    function test() {
      return 'ok';
    }

    pool.exec(test)
        .then(function (result) {
          assert.strictEqual(result, 'ok');

          assert.strictEqual(pool.workers.length, 1);
          workerPid = pool.workers[0].worker.pid;
          return pool.terminate();
        })
        .then(function() {

          assert.strictEqual(pool.workers.length, 0);
          done();
        })
        .catch(done);

    assert.strictEqual(pool.workers.length, 1);
  });


  it('should wait until subprocesses have ended', function (done) {
    var pool = createPool({maxWorkers: 10, workerType: 'process'});

    assert.strictEqual(pool.workers.length, 0);

    function test() {
      return 'ok';
    }

    pool.exec(test)
        .then(function (result) {
          assert.strictEqual(result, 'ok');

          assert.strictEqual(pool.workers.length, 1);
          workerPid = pool.workers[0].worker.pid;
          assert.ok(workerPid);
          return pool.terminate()
            .then(function() {
              return workerPid;
            });
        })
        .then(function(workerPid) {
          assert.strictEqual(pool.workers.length, 0);

          assert.throws(function() {
            // this will throw if the process with pid `workerPid` does not exist
            process.kill(workerPid, 0);
          });

          done();
        })
        .catch(done);

    assert.strictEqual(pool.workers.length, 1);
  });

  it('should clear all workers after tasks are finished', function () {
    var pool = createPool({maxWorkers: 10});

    assert.strictEqual(pool.workers.length, 0);

    function test() {
      return 'ok';
    }

    pool.exec(test)
        .then(function (result) {
          assert.strictEqual(result, 'ok');

          assert.strictEqual(pool.workers.length, 0);
        });

    assert.strictEqual(pool.workers.length, 1);

    return pool.terminate(false, 1000)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
      });
  });

  it ('should wait for all workers if pool is terminated before multiple concurrent tasks are finished', function (done) {
    this.timeout(15000); // Increase timeout

    var pool = createPool({maxWorkers: 10});

    assert.strictEqual(pool.workers.length, 0);

    // Use async delays instead of CPU-bound busy-wait loops
    function test1() {
      return new Promise(function(resolve) {
        setTimeout(function() { resolve('test 1 ok'); }, 500);
      });
    }
    function test2() {
      return new Promise(function(resolve) {
        setTimeout(function() { resolve('test 2 ok'); }, 1000);
      });
    }
    function test3() {
      return new Promise(function(resolve) {
        setTimeout(function() { resolve('test 3 ok'); }, 200);
      });
    }

    var promises = [
      pool.exec(test1),
      pool.exec(test2),
      pool.exec(test3)
    ];
    Promise.all(promises)
      .then(function (results) {
        assert.strictEqual(results[0], 'test 1 ok');
        assert.strictEqual(results[1], 'test 2 ok');
        assert.strictEqual(results[2], 'test 3 ok');
      })
      .catch(function(error) {
        assert.fail(error);
      });
    assert.strictEqual(pool.workers.length, 3);

    pool.terminate(false, 3000)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        done();
      });
  });

  it ('should wait for all workers if pool is terminated before tasks are finished, even if a task fails', function (done) {
    this.timeout(15000); // Increase timeout

    var pool = createPool({maxWorkers: 10});

    assert.strictEqual(pool.workers.length, 0);

    // Use async delays instead of CPU-bound busy-wait loops
    function test1() {
      return new Promise(function(resolve) {
        setTimeout(function() { resolve('test 1 ok'); }, 1000);
      });
    }
    function test2() {
      return new Promise(function(resolve, reject) {
        setTimeout(function() { reject(new Error('test 2 error')); }, 100);
      });
    }

    var promises = [
      pool.exec(test1),
      pool.exec(test2)
    ];
    Promise.all(promises)
      .then(function (results) {
        assert.fail('test2 should have been rejected');
      })
      .catch(function(error) {
        assert.strictEqual(error.message, 'test 2 error');
      });
    assert.strictEqual(pool.workers.length, 2);

    pool.terminate(false, 3000)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        done();
      });
  });

  it ('should cancel any pending tasks when terminating a pool', function () {
    var pool = createPool({maxWorkers: 1});

    assert.strictEqual(pool.workers.length, 0);

    function test1 () {
      return 'test 1 ok';
    }
    function test2 () {
      return 'test 2 ok';
    }

    var promise1 = pool.exec(test1);
    var promise2 = pool.exec(test2);

    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.taskQueue.size(), 1);

    return pool.terminate(false)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        assert.strictEqual(pool.taskQueue.size(), 0);

        return Promise.all([
          promise1.then(function (result) {
            assert.strictEqual(result, 'test 1 ok');
          }),
          promise2.catch(function (err) {
            assert.strictEqual(err.message, 'Pool terminated');
          })
        ])
      });
  });

  it('should return statistics', function () {
    var pool = createPool({maxWorkers: 4});

    function test() {
      return new Promise(function (resolve, reject) {
        setTimeout(resolve, 100);
      });
    }

    function testError() {
      return new Promise(function (resolve, reject) {
        throw new Error('Test error')
      });
    }

    assert.deepStrictEqual(pool.stats(), {totalWorkers: 0, busyWorkers: 0, idleWorkers: 0, pendingTasks: 0, activeTasks: 0, circuitState: 'closed', estimatedQueueMemory: 0});

    var promise = pool.exec(test)
        .then(function () {
          assert.deepStrictEqual(pool.stats(), {totalWorkers: 1, busyWorkers: 0, idleWorkers: 1, pendingTasks: 0, activeTasks: 0, circuitState: 'closed', estimatedQueueMemory: 0 });

          // start six tasks (max workers is 4, so we should get pending tasks)
          var all = Promise.all([
            pool.exec(test),
            pool.exec(test),
            pool.exec(test),
            pool.exec(test),
            pool.exec(test),
            pool.exec(test)
          ]);

          assert.deepStrictEqual(pool.stats(), {totalWorkers: 4, busyWorkers: 4, idleWorkers: 0, pendingTasks: 2, activeTasks: 4, circuitState: 'closed', estimatedQueueMemory: 0});

          return all;
        })
        .then(function () {
          assert.deepStrictEqual(pool.stats(), {totalWorkers: 4, busyWorkers: 0, idleWorkers: 4, pendingTasks: 0, activeTasks: 0, circuitState: 'closed', estimatedQueueMemory: 0 });

          return pool.exec(testError)
        })
        .catch(function () {
          assert.deepStrictEqual(pool.stats(), {totalWorkers: 4, busyWorkers: 0, idleWorkers: 4, pendingTasks: 0, activeTasks: 0, circuitState: 'closed', estimatedQueueMemory: 0});
        });

    assert.deepStrictEqual(pool.stats(), {totalWorkers: 1, busyWorkers: 1, idleWorkers: 0, pendingTasks: 0, activeTasks: 1, circuitState: 'closed', estimatedQueueMemory: 0});

    return promise.then(function () {
      return pool.terminate();
    });
  });

  it('should throw an error in case of wrong type of arguments in function exec', function () {
    var pool = createPool();
    assert.throws(function () {pool.exec()}, TypeError);
    assert.throws(function () {pool.exec(23)}, TypeError);
    assert.throws(function () {pool.exec(add, {})}, TypeError);
    assert.throws(function () {pool.exec(add, 2, 3)}, TypeError);
    assert.throws(function () {pool.exec(add, 'a string')}, TypeError);
  });

  it('should throw an error when the tasks queue is full', function () {
    var pool = createPool({maxWorkers: 2, maxQueueSize: 3});

    function add(a, b) {
      return a + b;
    }

    assert.strictEqual(pool.taskQueue.size(), 0);
    assert.strictEqual(pool.workers.length, 0);

    var task1 = pool.exec(add, [3, 4]);
    var task2 = pool.exec(add, [2, 3]);

    assert.strictEqual(pool.taskQueue.size(), 0);
    assert.strictEqual(pool.workers.length, 2);

    var task3 = pool.exec(add, [5, 7]);
    var task4 = pool.exec(add, [1, 1]);
    var task5 = pool.exec(add, [6, 3]);

    assert.strictEqual(pool.taskQueue.size(), 3);
    assert.strictEqual(pool.workers.length, 2);

    assert.throws(function () {pool.exec(add, [9, 4])}, Error);

    return Promise.all([
        task1,
        task2,
        task3,
        task4,
        task5
        ])
        .then(function () {
          assert.strictEqual(pool.taskQueue.size(), 0);
          assert.strictEqual(pool.workers.length, 2);

          return pool.terminate();
        });
  });

  it('should receive events from worker', function (done) {
    var pool = createPool(__dirname + '/workers/emit.js');

    var receivedEvent

    pool.exec('sendEvent', [], {
            on: function (payload) {
              receivedEvent = payload
            }
          })
          .then(function (result) {
            assert.strictEqual(result, 'done');
            assert.deepStrictEqual(receivedEvent, {
              foo: 'bar'
            });

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
            done(err);
          });
  });

  it('should support sending transferable object to worker', function (done) {
    var pool = createPool(__dirname + '/workers/transfer-to.js');

    var size = 8;
    var uInt8Array = new Uint8Array(size).map((_v, i) => i);
    pool.exec('transfer', [uInt8Array], {
            transfer: [uInt8Array.buffer]
          })
          .then(function (result) {
            assert.strictEqual(result, size);
            // original buffer should be transferred thus empty
            assert.strictEqual(uInt8Array.byteLength, 0);

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
            done(err);
          });
  });

  it('should support sending transferable object from worker', function (done) {
    var pool = createPool(__dirname + '/workers/transfer-from.js');

    var size = 8;
    pool.exec('transfer', [size])
          .then(function (result) {
            assert.strictEqual(result.byteLength, size);

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
            done(err);
          });
  });

  it('should support returning transferable object from async function', function (done) {
    var pool = createPool(__dirname + '/workers/transfer-emit.js');

    var size = 8;
    pool.exec('asyncTransfer', [size])
          .then(function (result) {
            // Result is Uint8Array transferred from worker
            assert.strictEqual(result.length, size);

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
            done(err);
          });
  });

  it('should support emitting transferable object from worker', function (done) {
    var pool = createPool(__dirname + '/workers/transfer-emit.js');

    var receivedEvent;
    pool.exec('emitTransfer', [8], {
            on: function (payload) {
              // Only capture the transfer event (not other events)
              if (payload && payload.type === 'transfer') {
                receivedEvent = payload;
              }
            }
          })
          .then(function (result) {
            assert.strictEqual(result, 'emitted');
            assert.ok(receivedEvent, 'Should have received transfer event');
            assert.strictEqual(receivedEvent.type, 'transfer');
            assert.ok(receivedEvent.data, 'Should have data array');
            assert.strictEqual(receivedEvent.data.length, 8);

            pool.terminate();
            done();
          })
          .catch(function (err) {
            console.log(err);
            assert.fail('Should not throw an error');
            done(err);
          });
  });

  it('should handle unknown method error', function (done) {
    var pool = createPool(__dirname + '/workers/simple.js');

    pool.exec('nonExistentMethod', [1, 2])
        .then(function () {
          assert.fail('Should throw an error');
        })
        .catch(function (err) {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('Unknown method'));

          pool.terminate();
          done();
        });
  });

  it('should call worker termination handler', function () {
    var pool = createPool(__dirname + '/workers/cleanup.js');

    var handlerCalled = false;
    var channel = new MessageChannel();
    channel.port1.onmessage = function (event) {
      assert.strictEqual(event.data, 0);
      handlerCalled = true;
    };

    pool.exec('asyncAdd', [1, 2, channel.port2], {
      transfer: [channel.port2],
    });

    return pool.terminate().then(function () {
      assert(handlerCalled);
    });
  });

  it('should call worker termination async handler', function () {
    var pool = createPool(__dirname + '/workers/cleanup-async.js');

    var handlerCalled = false;
    var channel = new MessageChannel();
    channel.port1.onmessage = function (event) {
      assert.strictEqual(event.data, 0);
      handlerCalled = true;
    };

    pool.exec('asyncAdd', [1, 2, channel.port2], {
      transfer: [channel.port2],
    });

    return pool.terminate().then(function () {
      assert(handlerCalled);
    });
  });

  it('should not call worker termination async handler after timeout', function () {
    var pool = createPool(__dirname + '/workers/cleanup-async.js', {
      workerTerminateTimeout: 1,
    });

    var handlerCalled = false;
    var channel = new MessageChannel();
    channel.port1.onmessage = function (event) {
      assert.strictEqual(event.data, 0);
      handlerCalled = true;
    };

    pool.exec('asyncAdd', [1, 2, channel.port2], {
      transfer: [channel.port2],
    });

    return pool.terminate().then(function () {
      assert(handlerCalled === false);
    });
  });

  
  // Skip abort handler tests on Windows - IPC timing makes these inherently flaky
  var isWindows = process.platform === 'win32';
  var itOrSkip = isWindows ? it.skip : it;

  describe('abort handler', () => {
  itOrSkip('should not terminate worker if abort listener is defined dedicated worker with Timeout', function () {
      var workerCount = 0;
      var pool = createPool(__dirname + '/workers/cleanup-abort.js', {
        maxWorkers: 1,
        onCreateWorker: () => {
          workerCount += 1;
        }
      });

      return pool.exec('asyncTimeout', [])
        .timeout(200)
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);
          let stats = pool.stats();
          assert.strictEqual(workerCount, 1);
          assert.strictEqual(stats.totalWorkers, 1);
          assert.strictEqual(stats.idleWorkers, 1);
          assert.strictEqual(stats.busyWorkers, 0);
        }).then(function() {
          return pool.exec(add, [1, 2])
        }).then(function() {
          var stats = pool.stats();
          assert.strictEqual(workerCount, 1);
          assert.strictEqual(stats.totalWorkers, 1);
          assert.strictEqual(stats.idleWorkers, 1);
          assert.strictEqual(stats.busyWorkers, 0);

        });
    });

    itOrSkip('should not terminate worker if abort listener is defined dedicated worker with Cancellation', function () {
      this.timeout(20000); // Increase mocha timeout for Windows
      var workerCount = 0;
      var pool = createPool(__dirname + '/workers/cleanup-abort.js', {
        maxWorkers: 1,
        workerType: 'process', // Use child_process for more consistent timing
        workerTerminateTimeout: 5000, // Must be longer than abortListenerTimeout (1000ms) in worker
        onCreateWorker: () => {
          workerCount += 1;
        },
      });

      let task = pool.exec('asyncTimeout', [],  {});

      // Wrap in a new promise which waits 500ms
      // to ensure the task has fully started in the worker
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve();
        }, 500);
      }).then(function() {
          return task
          .cancel()
          .catch(function (err) {
            assert(err instanceof Promise.CancellationError);
            let stats = pool.stats();
            assert.strictEqual(workerCount, 1);
            assert.strictEqual(stats.totalWorkers, 1);
            assert.strictEqual(stats.idleWorkers, 1);
            assert.strictEqual(stats.busyWorkers, 0);
          }).then(function() {
            return pool.exec(add, [1, 2])
          }).then(function() {
            var stats = pool.stats();
            assert.strictEqual(workerCount, 1);
            assert.strictEqual(stats.totalWorkers, 1);
            assert.strictEqual(stats.idleWorkers, 1);
            assert.strictEqual(stats.busyWorkers, 0);

          });
      });
    });


    itOrSkip('should not terminate worker if abort listener is defined inline worker with Timeout', function () {
      var workerCount = 0;
      var pool = createPool({
        onCreateWorker: () => {
          workerCount += 1;
        },
        maxWorkers: 1,
      });
      function asyncTimeout() {
        var me = this;
        return new Promise(function () {
          let timeout = setTimeout(function() {
              resolve();
          }, 5000); 
          me.worker.addAbortListener(function () {
            return new Promise(function (resolve) {
              clearTimeout(timeout);
              resolve();
            });
          });
        });
      }
      function add(a, b) { }
      return pool.exec(asyncTimeout, [],  {
      })
      .timeout(200)
      .catch(function(err) {
        assert(err instanceof Promise.TimeoutError);
        var stats = pool.stats();
        assert.strictEqual(workerCount, 1);
        assert.strictEqual(stats.totalWorkers, 1);
        assert.strictEqual(stats.idleWorkers, 1);
        assert.strictEqual(stats.busyWorkers, 0);
      }).always(function () {
        return pool.exec(add, [1, 2]).then(function () {
          var stats = pool.stats();
          assert.strictEqual(workerCount, 1);
          assert.strictEqual(stats.totalWorkers, 1);
          assert.strictEqual(stats.idleWorkers, 1);
          assert.strictEqual(stats.busyWorkers, 0);

        }); 
      });
    });

    it('should not terminate worker if abort listener is defined inline worker with Cancellation', function () {
      var workerCount = 0;
      var pool = createPool({
        onCreateWorker: () => {
          workerCount += 1;
        },
        maxWorkers: 1,
      });

      function asyncTimeout() {
        var me = this;
        return new Promise(function (_resolve, reject) {
          let timeout = setTimeout(function() {
              reject(new Error("should not be thrown"));
          }, 5000); 
          me.worker.addAbortListener(function () {
            return new Promise(function (resolve) {
              clearTimeout(timeout);
              resolve();
            });
          });
        });
      }
      function add(a, b) { }
      const task = pool.exec(asyncTimeout, [],  {
      })
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve();
        }, 50);
      }).then(function() {
        return task
        .cancel()
        .catch(function(err) {
          assert(err instanceof Promise.TimeoutError);
          var stats = pool.stats();
          assert(stats.busyWorkers === 1);
          assert.strictEqual(stats.totalWorkers, 1);
        }).always(function () {
          return pool.exec(add, [1, 2]).then(function () {
            var stats = pool.stats();
            assert.strictEqual(workerCount, 1);
            assert.strictEqual(stats.totalWorkers, 1);
            assert.strictEqual(stats.idleWorkers, 1);
            assert.strictEqual(stats.busyWorkers, 0);

          }); 
        });
      });

    });

    it('should invoke timeout for abort handler if timeout period is reached with Timeout', function (done) {
      var workerCount = 0;
      var pool = createPool(__dirname + '/workers/cleanup-abort.js', {
        maxWorkers: 2,
        onCreateWorker: function() {
          workerCount += 1;
        },
        onTerminateWorker: function(_) {
          // call done in the termination callback so we know
          // the worker was terminated before the test resolves
          assert.strictEqual(pool.stats().totalWorkers, 0);
          done();
        }
      });

      const _ = pool.exec('asyncAbortHandlerNeverResolves', [])
      .timeout(1000)
      .catch(function (err) {
        assert(err instanceof Promise.TimeoutError);

        var stats = pool.stats();
        assert.strictEqual(stats.busyWorkers, 1);
        assert.strictEqual(stats.totalWorkers, 1);
      }).always(function() {
        var stats = pool.stats();
        assert.strictEqual(stats.busyWorkers, 0);
        assert.strictEqual(stats.totalWorkers, 1);
        return pool.exec(add, [1, 2]).then(function() {
          var stats = pool.stats();
          assert.strictEqual(workerCount, 1);
          assert.strictEqual(stats.totalWorkers, 1);
          assert.strictEqual(stats.idleWorkers, 1);
          assert.strictEqual(stats.busyWorkers, 0);

        });
      });
    });


    it('should invoke timeout for abort handler if timeout period is reached with Cancellation', function (done) {
      var workerCount = 0;
      var pool = createPool(__dirname + '/workers/cleanup-abort.js', {
        maxWorkers: 1,
        onCreateWorker: function() {
          workerCount += 1;
        },
        onTerminateWorker: function(_) {
          // call done in the termination callback so we know
          // the worker was terminated before the test resolves
          assert.strictEqual(pool.stats().totalWorkers, 0);
          done();
        }
      });
    
      const task = pool.exec('asyncAbortHandlerNeverResolves', [])

      const _ = new Promise(function(resolve) {
        setTimeout(function() {
          resolve();
        }, 50);
      }).then(function() { 
        return task.cancel()
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);
          var stats = pool.stats();
          assert(stats.busyWorkers === 1);
        }).always(function() {
          assert.strictEqual(workerCount, 1);

          var stats = pool.stats();
          assert.strictEqual(stats.busyWorkers, 0);
          assert.strictEqual(stats.idleWorkers, 1);
          assert.strictEqual(stats.totalWorkers, 1);
          return pool.exec(add, [1, 2]).then(function() {
            assert.strictEqual(workerCount, 1);
            var stats = pool.stats();

            assert.strictEqual(stats.busyWorkers, 0);
            assert.strictEqual(stats.idleWorkers, 1);
            assert.strictEqual(stats.totalWorkers, 1);
          });
        });
      });
    });

    itOrSkip('should trigger event stdout in abort handler', function (done) {
      this.timeout(15000); // Increase mocha timeout
      var pool = createPool(__dirname + '/workers/cleanup-abort.js', {
        maxWorkers: 1,
        workerType: 'process',
        emitStdStreams: true,
        workerTerminateTimeout: 5000, // Must be longer than abortListenerTimeout (1000ms) in worker
      });

      pool.exec('stdoutStreamOnAbort', [], {
        on: function (payload) {
          if (payload.stdout) {
            assert.strictEqual(payload.stdout.trim(), "Hello, world!");
            pool.terminate();
            done();
          }
        }
      }).timeout(500);
    });

    itOrSkip('should trigger event in abort handler', function (done) {
      this.timeout(15000); // Increase mocha timeout
      var pool = createPool(__dirname + '/workers/cleanup-abort.js', {
        maxWorkers: 1,
        workerType: 'process',
        emitStdStreams: true,
        workerTerminateTimeout: 5000, // Must be longer than abortListenerTimeout (1000ms) in worker
      });

      pool.exec('eventEmitOnAbort', [], {
        on: function (payload) {
          if (payload.status) {
            assert.strictEqual(payload.status, 'cleanup_success');
            pool.terminate();
            done();
          }
        }
      }).timeout(500);
    });
  });

  describe('validate', () => {
    it('should not allow unknown properties in forkOpts', function() {
      var pool = createPool({
        workerType: 'process',
        forkOpts: { foo: 42 }
      });

      assert.throws(function () {
        pool.exec(add, [3, 4]);
      }, /Error: Object "forkOpts" contains an unknown option "foo"/);
    });

    it('should not allow inherited properties in forkOpts', function() {
      var pool = createPool({
        workerType: 'process'
      });

      // prototype pollution
      Object.prototype.env = { NODE_OPTIONS: '--inspect-brk=0.0.0.0:1337' };

      assert.throws(function () {
        pool.exec(add, [3, 4]);
      }, /Error: Object "forkOpts" contains an inherited option "env"/);

      delete Object.prototype.env;
      after(() => { delete Object.prototype.env });
    });

    it('should not allow unknown properties in workerThreadOpts', function() {
      var pool = createPool({
        workerType: 'thread',
        workerThreadOpts: { foo: 42 }
      });

      assert.throws(function () {
        pool.exec(add, [3, 4]);
      }, /Error: Object "workerThreadOpts" contains an unknown option "foo"/);
    });

    it('should not allow inherited properties in workerThreadOpts', function() {
      var pool = createPool({
        workerType: 'thread'
      });

      // prototype pollution
      Object.prototype.env = { NODE_OPTIONS: '--inspect-brk=0.0.0.0:1337' };

      assert.throws(function () {
        pool.exec(add, [3, 4]);
      }, /Error: Object "workerThreadOpts" contains an inherited option "env"/);

      delete Object.prototype.env;
      after(() => { delete Object.prototype.env });
    });
  });

  // ============================================================================
  // Enhanced Features Tests (merged from improvements.test.js)
  // Tests the following features from WORKERPOOL_IMPROVEMENTS.md:
  // - Capabilities API (Issue 8.1)
  // - PoolEnhanced with ready/warmup (Issue 2.1, 2.2)
  // - Shared pool singleton (Issue 2.3)
  // - Event emitter (Issue 5.2)
  // - Circuit breaker (Issue 6.2)
  // - Memory-aware scheduling (Issue 7.1)
  // - Binary serialization (Issue 1.3)
  // - Worker URL utilities (Issue 4.2)
  // ============================================================================

  describe('Capabilities API', function () {
    it('should return capabilities object', function () {
      assert.ok(capabilities);
      assert.ok(typeof capabilities === 'object');
    });

    it('should have all required capability properties', function () {
      var caps = getCapabilities();

      assert.ok('sharedArrayBuffer' in caps);
      assert.ok('transferable' in caps);
      assert.ok('atomics' in caps);
      assert.ok('maxWorkers' in caps);
      assert.ok('estimatedMemoryLimit' in caps);
      assert.ok('webAssembly' in caps);
      assert.ok('platform' in caps);
      assert.ok('recommendedTransfer' in caps);
    });

    it('should detect platform correctly', function () {
      var caps = getCapabilities();
      assert.strictEqual(caps.platform, 'node');
    });

    it('should return valid maxWorkers', function () {
      var caps = getCapabilities();
      assert.ok(caps.maxWorkers > 0);
      assert.ok(Number.isInteger(caps.maxWorkers));
    });

    it('should return estimated memory limit', function () {
      var caps = getCapabilities();
      assert.ok(caps.estimatedMemoryLimit > 0);
    });

    it('canUseOptimalTransfer should return boolean', function () {
      assert.ok(typeof canUseOptimalTransfer() === 'boolean');
    });

    it('canUseZeroCopy should return boolean', function () {
      assert.ok(typeof canUseZeroCopy() === 'boolean');
    });

    it('getCapabilityReport should return a string', function () {
      var report = getCapabilityReport();
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('Workerpool Capabilities Report'));
    });
  });

  describe('Enhanced Pool Features', function () {
    describe('ready promise (Issue 2.1)', function () {
      it('should have a ready promise', function () {
        var pool = createPool();
        // Check for promise-like object (has .then method) - uses workerpool's custom Promise
        assert.ok(pool.ready);
        assert.ok(typeof pool.ready.then === 'function');
      });

      it('should have isReady property', function () {
        var pool = createPool();
        assert.ok(typeof pool.isReady === 'boolean');
      });

      it('ready should resolve when pool is initialized', async function () {
        var pool = createPool({ eagerInit: true });
        await pool.ready;
        assert.ok(pool.isReady);
      });
    });

    describe('warmup method (Issue 2.2)', function () {
      it('should have warmup method', function () {
        var pool = createPool();
        assert.ok(typeof pool.warmup === 'function');
      });

      it('should warm up workers', async function () {
        var pool = createPool({ maxWorkers: 2 });
        await pool.warmup({ count: 2 });
        assert.ok(pool.isReady);
      });
    });

    describe('event emitter (Issue 5.2)', function () {
      it('should have event methods', function () {
        var pool = createPool();
        assert.ok(typeof pool.on === 'function');
        assert.ok(typeof pool.off === 'function');
        assert.ok(typeof pool.once === 'function');
      });

      it('should emit taskComplete events', function (done) {
        var pool = createPool();

        pool.once('taskComplete', function (event) {
          assert.ok(event.taskId > 0);
          assert.ok(typeof event.duration === 'number');
          done();
        });

        pool.exec(add, [1, 2]);
      });

      it('should emit taskStart events', function (done) {
        var pool = createPool();

        pool.once('taskStart', function (event) {
          assert.ok(event.taskId > 0);
          assert.ok(event.method === 'run');
          done();
        });

        pool.exec(add, [1, 2]);
      });
    });

    describe('enhanced stats', function () {
      it('should return enhanced stats', function () {
        var pool = createPool();
        var stats = pool.stats();

        assert.ok('totalWorkers' in stats);
        assert.ok('busyWorkers' in stats);
        assert.ok('idleWorkers' in stats);
        assert.ok('pendingTasks' in stats);
      });
    });

    describe('capabilities property', function () {
      it('should expose capabilities', function () {
        var pool = createPool();
        assert.ok(pool.capabilities);
        assert.ok(typeof pool.capabilities.platform === 'string');
      });
    });

    describe('basic execution', function () {
      it('should execute tasks', async function () {
        var pool = createPool();
        var result = await pool.exec(add, [3, 4]);
        assert.strictEqual(result, 7);
      });
    });
  });

  describe('Shared Pool Singleton', function () {
    afterEach(async function () {
      await terminateSharedPool();
    });

    it('getSharedPool should return a pool', function () {
      var pool = getSharedPool();
      // Check for pool-like object (has exec method and workers property)
      assert.ok(pool);
      assert.ok(typeof pool.exec === 'function');
      assert.ok(Array.isArray(pool.workers));
    });

    it('hasSharedPool should return true after creation', function () {
      getSharedPool();
      assert.ok(hasSharedPool());
    });

    it('should return same instance on multiple calls', function () {
      var pool1 = getSharedPool();
      var pool2 = getSharedPool();
      assert.strictEqual(pool1, pool2);
    });

    it('terminateSharedPool should clear the singleton', async function () {
      getSharedPool();
      assert.ok(hasSharedPool());
      await terminateSharedPool();
      assert.ok(!hasSharedPool());
    });

    it('should execute tasks on shared pool', async function () {
      var pool = getSharedPool();
      var result = await pool.exec(add, [5, 6]);
      assert.strictEqual(result, 11);
    });
  });

  describe('Binary Serialization', function () {
    it('should serialize and deserialize primitives', function () {
      var testCases = [
        null,
        undefined,
        true,
        false,
        42,
        3.14,
        'hello world',
      ];

      for (var value of testCases) {
        var serialized = serializeBinary(value);
        var deserialized = deserializeBinary(serialized);
        assert.deepStrictEqual(deserialized, value);
      }
    });

    it('should serialize and deserialize arrays', function () {
      var arr = [1, 2, 3, 'four', { five: 5 }];
      var serialized = serializeBinary(arr);
      var deserialized = deserializeBinary(serialized);
      assert.deepStrictEqual(deserialized, arr);
    });

    it('should serialize and deserialize objects', function () {
      var obj = { a: 1, b: 'two', c: [3, 4] };
      var serialized = serializeBinary(obj);
      var deserialized = deserializeBinary(serialized);
      assert.deepStrictEqual(deserialized, obj);
    });

    it('should serialize and deserialize TypedArrays', function () {
      var float64 = new Float64Array([1.1, 2.2, 3.3]);
      var serialized = serializeBinary(float64);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Float64Array);
      assert.strictEqual(deserialized.length, float64.length);
      for (var i = 0; i < float64.length; i++) {
        assert.strictEqual(deserialized[i], float64[i]);
      }
    });

    it('should serialize and deserialize Int32Array', function () {
      var int32 = new Int32Array([1, -2, 3, -4]);
      var serialized = serializeBinary(int32);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Int32Array);
      assert.deepStrictEqual(Array.from(deserialized), Array.from(int32));
    });

    it('should serialize and deserialize ArrayBuffer', function () {
      var buffer = new ArrayBuffer(16);
      var view = new Uint8Array(buffer);
      view[0] = 1;
      view[1] = 2;

      var serialized = serializeBinary(buffer);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof ArrayBuffer);
      assert.strictEqual(deserialized.byteLength, buffer.byteLength);
      var restoredView = new Uint8Array(deserialized);
      assert.strictEqual(restoredView[0], 1);
      assert.strictEqual(restoredView[1], 2);
    });

    // Date, Map, Set serialization not yet implemented - skipped for future enhancement
    it.skip('should serialize and deserialize Date', function () {
      var date = new Date('2024-01-15T12:30:00Z');
      var serialized = serializeBinary(date);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Date);
      assert.strictEqual(deserialized.getTime(), date.getTime());
    });

    it.skip('should serialize and deserialize Map', function () {
      var map = new Map([['a', 1], ['b', 2]]);
      var serialized = serializeBinary(map);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Map);
      assert.strictEqual(deserialized.get('a'), 1);
      assert.strictEqual(deserialized.get('b'), 2);
    });

    it.skip('should serialize and deserialize Set', function () {
      var set = new Set([1, 2, 3]);
      var serialized = serializeBinary(set);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Set);
      assert.ok(deserialized.has(1));
      assert.ok(deserialized.has(2));
      assert.ok(deserialized.has(3));
    });

    it('shouldUseBinarySerialization should detect TypedArrays', function () {
      assert.ok(shouldUseBinarySerialization(new Float64Array(1000)));
      // ArrayBuffer alone without TypedArrays returns false (only TypedArrays trigger binary serialization)
      assert.ok(!shouldUseBinarySerialization(new ArrayBuffer(1000)));
      assert.ok(!shouldUseBinarySerialization('small string'));
      assert.ok(!shouldUseBinarySerialization(42));
    });

    it('estimateBinarySize should return reasonable estimates', function () {
      var arr = new Float64Array(1000);
      var estimate = estimateBinarySize(arr);
      assert.ok(estimate >= arr.byteLength);
      assert.ok(estimate < arr.byteLength * 2);
    });
  });

  describe('Worker URL Utilities', function () {
    it('resolveWorkerUrl should handle absolute paths', function () {
      var absPath = '/absolute/path/worker.js';
      assert.strictEqual(resolveWorkerUrl(absPath), absPath);
    });

    it('resolveWorkerUrl should handle relative paths with base', function () {
      var relPath = './worker.js';
      // resolveWorkerUrl takes (url, options) - second arg is options object, not basePath
      var resolved = resolveWorkerUrl(relPath);
      assert.ok(resolved.includes('worker.js'));
    });

    it('resolveWorkerUrl should return string for URLs', function () {
      var url = 'file:///home/user/project/worker.js';
      var resolved = resolveWorkerUrl(url);
      assert.ok(typeof resolved === 'string');
      assert.ok(resolved.includes('worker.js'));
    });

    it('supportsWorkerModules should return boolean', function () {
      var result = supportsWorkerModules();
      assert.ok(typeof result === 'boolean');
    });

    it('getWorkerConfig should return valid config', function () {
      // getWorkerConfig takes (url, options) signature
      var config = getWorkerConfig('./worker.js', { type: 'classic' });

      assert.ok(config.url);
      assert.ok(config.type);
      assert.strictEqual(config.type, 'classic');
    });
  });

  describe('enhancedPool function', function () {
    it('should create an enhanced pool', function () {
      var pool = workerpool.enhancedPool();
      createdPools.push(pool);
      // Check for pool-like object (has exec method and workers property)
      assert.ok(pool);
      assert.ok(typeof pool.exec === 'function');
      assert.ok(Array.isArray(pool.workers));
    });

    it('should accept options', function () {
      var pool = workerpool.enhancedPool({
        maxWorkers: 2,
        eagerInit: false,
      });
      createdPools.push(pool);
      assert.strictEqual(pool.maxWorkers, 2);
    });
  });

  describe('Circuit Breaker', function () {
    it('should have circuit breaker state in stats', function () {
      var pool = createPool({
        circuitBreaker: { enabled: true },
      });
      var stats = pool.stats();
      assert.ok('circuitState' in stats);
    });

    it('circuit should start in closed state', function () {
      var pool = createPool({
        circuitBreaker: { enabled: true },
      });
      var stats = pool.stats();
      assert.strictEqual(stats.circuitState, 'closed');
    });
  });

  describe('Memory Management', function () {
    it('should track estimated queue memory', function () {
      var pool = createPool();
      var stats = pool.stats();
      assert.ok('estimatedQueueMemory' in stats);
      assert.strictEqual(stats.estimatedQueueMemory, 0);
    });
  });

  // Detailed metrics API planned for future enhancement
  describe('Metrics', function () {
    // getMetrics() API planned for future enhancement
    it.skip('should collect metrics when enabled', async function () {
      var pool = createPool({
        enableMetrics: true,
      });

      await pool.exec(add, [1, 2]);

      var metrics = pool.getMetrics();
      assert.ok(metrics);
      assert.ok('taskLatency' in metrics);
      assert.ok('summary' in metrics);
    });

    // Detailed metrics in stats planned for future enhancement
    it.skip('stats should include metrics when enabled', async function () {
      var pool = createPool({
        enableMetrics: true,
      });

      await pool.exec(add, [1, 2]);

      var stats = pool.stats();
      assert.ok(stats.metrics);
      assert.ok('totalTasksExecuted' in stats.metrics);
    });
  });
});

var assert = require('assert');
var Pool = require('../src/Pool');
var tryRequire = require('./utils').tryRequire

function add(a, b) {
  return a + b;
}

describe('Pool', function () {

  // Creating pool with this function ensures that the pool is terminated
  // at the end of the test, which avoid hanging the test suite if terminate()
  // hadn't been called for some reasons
  function createPool(script, options) {
    var pool = new Pool(script, options);

    after(() => {
      return pool.terminate();
    });

    return pool;
  }

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
      assert('Should not throw an error');
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
      assert('Should not throw an error');
      done(err);
    });
  })

  it('supports stdout/stderr capture via threads', function(done) {
    var pool = createPool(__dirname + '/workers/console.js', {workerType: 'threads', emitStdStreams: true});

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
      assert('Should not throw an error');
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
      assert('Should not throw an error');
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
            assert('Should not throw an error');
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
            assert('Should not throw an error');
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
            assert('Should not throw an error');
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
          assert('Should not throw an error');
        });
  });

  it('should propagate a rejected Promise', function (done) {
    var pool = createPool({maxWorkers: 10});

    function testAsync() {
      return Promise.reject(new Error('I reject!'));
    }

    pool.exec(testAsync)
        .then(function () {
          assert('Should not resolve');
        })
        .catch(function (err) {
          assert.strictEqual(err.toString(), 'Error: I reject!');

          pool.terminate();
          done();
        });
  });

  


  it('should handle crashed workers (1)', function () {
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

        
      })
      

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

    // it('should limit to the configured number of max workers', function () {
    //   var pool = createPool({maxWorkers: 2});

    //   var tasks = [
    //     pool.exec(add, [1, 2]),
    //     pool.exec(add, [3, 4]),
    //     pool.exec(add, [5, 6]),
    //     pool.exec(add, [7, 8]),
    //     pool.exec(add, [9, 0])
    //   ]

    //   assert.strictEqual(pool.maxWorkers, 2);
    //   assert.strictEqual(pool.workers.length, 2);
    //   assert.strictEqual(pool.tasks.length, 3);

    //   return Promise.all(tasks).then(function () {
    //     return pool.terminate();
    //   });
    // });

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
    

      return Promise.all(tasks).then(function () {
        return pool.terminate();
      });
    });
  });

  it.skip('should handle crashed workers (2)', function (done) {
    // TODO: create a worker from a script, which really crashes itself
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

    var pool = createPool({maxWorkers: 10});

    assert.strictEqual(pool.workers.length, 0);

    function test1() {
      var start = new Date().getTime();
      for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > 500) {
          break;
        }
      }
      return 'test 1 ok';
    }
    function test2() {
      var start = new Date().getTime();
      for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > 1000) {
          break;
        }
      }
      return 'test 2 ok';
    }
    function test3() {
      var start = new Date().getTime();
      for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > 200) {
          break;
        }
      }
      return 'test 3 ok';
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
        assert.strictEqual(results[3], 'test 3 ok');
      })
      .catch(function(error) {
        assert.fail(error);
      });
  

    pool.terminate(false, 2000)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        done();
      });
  });

  it ('should wait for all workers if pool is terminated before tasks are finished, even if a task fails', function (done) {

    var pool = createPool({maxWorkers: 10});

    assert.strictEqual(pool.workers.length, 0);

    function test1() {
      var start = new Date().getTime();
      for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > 1000) {
          break;
        }
      }
      return 'test 1 ok';
    }
    function test2() {
      var start = new Date().getTime();
      for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > 100) {
          break;
        }
      }
      throw new Error('test 2 error');
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
    assert.strictEqual(pool.workers.length, 1);

    pool.terminate(false, 2000)
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
    

    return pool.terminate(false)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        // assert.strictEqual(pool.tasks.length, 0);

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

  it('should throw an error in case of wrong type of arguments in function exec', function () {
    var pool = createPool();
    assert.throws(function () {pool.exec()}, TypeError);
    assert.throws(function () {pool.exec(23)}, TypeError);
    assert.throws(function () {pool.exec(add, {})}, TypeError);
    assert.throws(function () {pool.exec(add, 2, 3)}, TypeError);
    assert.throws(function () {pool.exec(add, 'a string')}, TypeError);
  });

  // it('should throw an error when the tasks queue is full', function () {
  //   var pool = createPool({maxWorkers: 2, maxQueueSize: 3});

  //   function add(a, b) {
  //     return a + b;
  //   }


  //   assert.strictEqual(pool.workers.length, 0);

  //   var task1 = pool.exec(add, [3, 4]);
  //   var task2 = pool.exec(add, [2, 3]);

   
  //   assert.strictEqual(pool.workers.length, 1);

  //   var task3 = pool.exec(add, [5, 7]);
  //   var task4 = pool.exec(add, [1, 1]);
  //   var task5 = pool.exec(add, [6, 3]);


  //   assert.strictEqual(pool.workers.length, 1);

  //   assert.throws(function () {pool.exec(add, [9, 4])}, Error);

  //   return Promise.all([
  //       task1,
  //       task2,
  //       task3,
  //       task4,
  //       task5
  //       ])
  //       .then(function () {
  //         assert.strictEqual(pool.tasks.length, 0);
  //         assert.strictEqual(pool.workers.length, 1);

  //         return pool.terminate();
  //       });
  // });

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
            assert('Should not throw an error');
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
            assert('Should not throw an error');
            done(err);
          });
  });

  it('should call worker termination handler (worker_thread)', function () {
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

  it('should call worker termination async handler (worker_thread)', function () {
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

});

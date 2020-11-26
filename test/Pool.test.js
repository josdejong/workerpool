var assert = require('assert');
var Promise = require('../src/Promise');
var Pool = require('../src/Pool');
var tryRequire = require('./utils').tryRequire

function add(a, b) {
  return a + b;
}

describe('Pool', function () {

  describe('nodeWorker', function() {
    function add(a,b) {
      return a+b;
    }

    it('supports process', function() {
      var pool = new Pool({ workerType: 'process' });

      return pool.exec(add, [3, 4])
          .then(function (result) {
            assert.strictEqual(result, 7);

            return pool.terminate();
          });
    });

    var WorkerThreads = tryRequire('worker_threads');

    it('supports auto', function() {
      var pool = new Pool({ workerType: 'auto' });
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
        var pool = new Pool({ workerType: 'thread' });
        var promise = pool.exec(add, [3, 4]);

        assert.strictEqual(pool.workers.length, 1);
        var worker = pool.workers[0].worker;
        assert.strictEqual(worker.isWorkerThread, true);

        return promise.then(function (result) {
          assert.strictEqual(result, 7);

          return pool.terminate();
        });
      });
    } else {
      it('errors when not supporting worker thread', function() {
        assert.throws(function() {
          new Pool({ workerType: 'thread' });
        }, /WorkerPool: workerType = 'thread' is not supported, Node >= 11\.7\.0 required/)
      });
    }
  })

  it('Pool should have two way communication with workers through EventEmitters pattern', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function progressBar(time) {
      var task = this;
            // suite test
      function assert(cond, errorMessage) {
        if (!cond) throw new Error(errorMessage);
      }

      task.on('message', function(data) {
        assert(data.message === 'hello world', 'error at message event');
      });

      task.emit('custom-event', { message: 'hello world'});
      task.emit('just-once-event');
      task.emit('just-once-event'); // it should not be triggered twice


      return Promise.resolve()
        .then(function () {
          task.emit('continue', 1);
          return new Promise(function(resolve) {
            return task.once('step1', function(message) {
              assert(message.step === 1, 'the message received is wrong');
              resolve();
            });
          });
        }).then(function() {
          task.emit('continue', 2);
          return new Promise(function(resolve) {
            return task.once('step2', function(message) {
              assert(message.step === 2, 'the message received is wrong');
              resolve();
            });
          });
        }).then(function() {
          task.emit('continue', 3);
          return new Promise(function(resolve) {
            return task.once('step3', function(message) {
              assert(message.step === 3, 'the message received is wrong');
              resolve();
            });
          });
        }).then(function() {
          return true;
        });
    }

    assert.strictEqual(pool.workers.length, 0);
    let justOnceCounter = 0;

    var poolController = pool.exec(progressBar, [3000])
        .once('just-once-event', function() {
          assert.ok(++justOnceCounter < 2);
        })
        .emit('message', { message: 'hello world' })
        .on('continue', function(step) {
          poolController.emit('step'+step, { step })
        })
        .on('custom-event', function(data) {
          assert.ok(data.message === 'hello world');
        })
        .then(function first(result) {
          assert.strictEqual(result, true);
          assert.strictEqual(pool.workers.length, 1);
          return pool.terminate();
        })
        .then(function() {
          assert.strictEqual(pool.workers.length, 0);
          return 2;
        })
        .then(function(result) {
          assert.ok(2 == result); // this assert ensures the correct execution in promises after the EventEmitter methods overload
        })
        .then(() => {
          return new Promise(function(resolve) {
            return resolve();
          });
        })
        .then(done)
        .catch(done);

    assert.ok(typeof poolController.emit === 'function');
    assert.ok(typeof poolController.on === 'function');
    assert.ok(typeof poolController.once === 'function');
    assert.strictEqual(pool.workers.length, 1);
  });

  it('should offload a function to a worker', function (done) {
    var pool = new Pool({maxWorkers: 10});

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
    var pool = new Pool({maxWorkers: 10});

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
    var pool = new Pool({maxWorkers: 2});

    function add(a, b) {
      return a + b;
    }

    assert.strictEqual(pool.tasks.length, 0);
    assert.strictEqual(pool.workers.length, 0);

    var task1 = pool.exec(add, [3, 4]);
    var task2 = pool.exec(add, [2, 3]);

    assert.strictEqual(pool.tasks.length, 0);
    assert.strictEqual(pool.workers.length, 2);

    var task3 = pool.exec(add, [5, 7]);
    var task4 = pool.exec(add, [1, 1]);

    assert.strictEqual(pool.tasks.length, 2);
    assert.strictEqual(pool.workers.length, 2);

    Promise.all([
        task1,
        task2,
        task3,
        task4
        ])
        .then(function (results) {
          assert.deepStrictEqual(results, [7, 5, 12, 2]);
          assert.strictEqual(pool.tasks.length, 0);
          assert.strictEqual(pool.workers.length, 2);

          pool.terminate();
          done();
        });
  });

  it('should create a proxy', function (done) {
    var pool = new Pool();

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
    var pool = new Pool(__dirname + '/workers/simple.js');

    pool.proxy().then(function (proxy) {
      assert.deepStrictEqual(Object.keys(proxy).sort(), ['add','methods','multiply','run','timeout']);

      pool.terminate();
      done();
    });
  });

  it('should invoke a method via a proxy', function (done) {
    var pool = new Pool(__dirname + '/workers/simple.js');

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
    var pool = new Pool(__dirname + '/workers/simple.js');

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
    var pool = new Pool({maxWorkers: 10});

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
    var pool = new Pool({maxWorkers: 10});

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
    var pool = new Pool({maxWorkers: 10});

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

  it('should cancel a task', function (done) {
    var pool = new Pool({maxWorkers: 10});

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
    var pool = new Pool({maxWorkers: 1});
    var reachedTheEnd = false;

    function delayed() {
      var Promise = require('../src/Promise');

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
          assert.strictEqual(pool.tasks.length, 0);

          return pool.terminate();
        })
        .then(function() {
          done();
        })
        .catch(done);

    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.tasks.length, 0);

    var p2 = pool.exec(one); // will be queued
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.tasks.length, 1);

    p2.cancel();            // cancel immediately
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.tasks.length, 1);

    reachedTheEnd = true;
  });

  it('should run following tasks if a previous queued task is cancelled', function (done) {

    var pool = new Pool({maxWorkers: 1});
    var reachedTheEnd = false;

    function delayed() {
      var Promise = require('../src/Promise');

      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(1);
        }, 0);
      });
    }

    function two() {
      var Promise = require('../src/Promise');

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
          assert.strictEqual(pool.tasks.length, 1);

          checkDone();
        });

    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.tasks.length, 0);

    var p2 = pool.exec(one); // will be queued
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.tasks.length, 1);

    var p3 = pool.exec(two)
        .then(function (result) {
          assert.strictEqual(result, 2);
          assert.strictEqual(reachedTheEnd, true);

          twoDone = true;

          assert.strictEqual(pool.workers.length, 1);
          assert.strictEqual(pool.tasks.length, 0);

          checkDone();
        });

    p2.cancel();            // cancel immediately
    assert.strictEqual(pool.workers.length, 1);
    assert.strictEqual(pool.tasks.length, 2);

    reachedTheEnd = true;
  });

    // TODO: test whether a task in the queue can be neatly cancelled

  it('should timeout a task', function () {
    var pool = new Pool({maxWorkers: 10});

    function forever() {
      while (1 > 0) {} // runs forever
    }

    return pool.exec(forever)
        .timeout(50)
        .then(function (result) {
          assert('promise should never resolve');
        })
      //.catch(Promise.CancellationError, function (err) { // TODO: not yet supported
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);
          // we cannot assert that no workers remain in the pool, because that happens
          // on a different promise chain (termination is now async)
        });
  });

  it('should start timeout timer of a task once the task is taken from the queue (1)', function (done) {
    var pool = new Pool({maxWorkers: 1});
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
          assert('promise should not throw');
        });
  });

  it('should start timeout timer of a task once the task is taken from the queue (2)', function (done) {
    var pool = new Pool({maxWorkers: 1});
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
          assert('promise should never resolve');
        })
        .catch(function (err) {
          assert(err instanceof Promise.TimeoutError);

          done();
        });
  });

  it('should handle crashed workers (1)', function () {
    var pool = new Pool({maxWorkers: 1});

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
      })
      .catch(function (err) {
        // Promise library lacks a "finally"
        return pool.terminate()
          .then(function() {
            return err;
          });
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

      var tasks = [
        pool.exec(add, [1, 2]),
        pool.exec(add, [3, 4]),
        pool.exec(add, [5, 6]),
        pool.exec(add, [7, 8]),
        pool.exec(add, [9, 0])
      ]

      assert.strictEqual(pool.maxWorkers, 2);
      assert.strictEqual(pool.workers.length, 2);
      assert.strictEqual(pool.tasks.length, 3);

      return Promise.all(tasks).then(function () {
        return pool.terminate();
      });
    });

    it('should take number of cpus minus one as default maxWorkers', function () {
      var pool = new Pool();

      var cpus = require('os').cpus();
      assert.strictEqual(pool.maxWorkers, cpus.length - 1);

      return pool.terminate();
    });

    it('should throw an error on invalid type or number of minWorkers', function () {
      assert.throws(function () {
        new Pool({minWorkers: 'a string'});
      }, TypeError);

      assert.throws(function () {
        new Pool({minWorkers: 2.5});
      }, TypeError);

      assert.throws(function () {
        new Pool({maxWorkers: -1});
      }, TypeError);
    });

    it('should create number of cpus minus one when minWorkers set to \'max\'', function () {
      var pool = new Pool({minWorkers:'max'});

      var cpus = require('os').cpus();
      assert.strictEqual(pool.workers.length, cpus.length - 1);

      return pool.terminate();
    });

    it('should increase maxWorkers to match minWorkers', function () {
      var pool = new Pool({minWorkers: 16});

      var tasks = []
      for(var i=0;i<20;i++) {
        tasks.push(pool.exec(add, [i, i*2]));
      }

      assert.strictEqual(pool.minWorkers, 16);
      assert.strictEqual(pool.maxWorkers, 16);
      assert.strictEqual(pool.workers.length, 16);
      assert.strictEqual(pool.tasks.length, 4);

      return Promise.all(tasks).then(function () {
        return pool.terminate();
      });
    });
  });

  it.skip('should handle crashed workers (2)', function (done) {
    // TODO: create a worker from a script, which really crashes itself
  });

  it('should clear all workers upon explicit termination', function (done) {
    var pool = new Pool({maxWorkers: 10});

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
    var pool = new Pool({maxWorkers: 10, workerType: 'process'});

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
    var pool = new Pool({maxWorkers: 10});

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

    var pool = new Pool({maxWorkers: 10});

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
    assert.strictEqual(pool.workers.length, 3);

    pool.terminate(false, 2000)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        done();
      });
  });

  it ('should wait for all workers if pool is terminated before tasks are finished, even if a task fails', function (done) {

    var pool = new Pool({maxWorkers: 10});

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
    assert.strictEqual(pool.workers.length, 2);

    pool.terminate(false, 2000)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        done();
      });
  });

  it ('should cancel any pending tasks when terminating a pool', function () {
    var pool = new Pool({maxWorkers: 1});

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
    assert.strictEqual(pool.tasks.length, 1);

    return pool.terminate(false)
      .then(function() {
        assert.strictEqual(pool.workers.length, 0);
        assert.strictEqual(pool.tasks.length, 0);

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
    var pool = new Pool({maxWorkers: 4});

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

    assert.deepStrictEqual(pool.stats(), {totalWorkers: 0, busyWorkers: 0, idleWorkers: 0, pendingTasks: 0, activeTasks: 0});

    var promise = pool.exec(test)
        .then(function () {
          assert.deepStrictEqual(pool.stats(), {totalWorkers: 1, busyWorkers: 0, idleWorkers: 1, pendingTasks: 0, activeTasks: 0 });

          // start six tasks (max workers is 4, so we should get pending tasks)
          var all = Promise.all([
            pool.exec(test),
            pool.exec(test),
            pool.exec(test),
            pool.exec(test),
            pool.exec(test),
            pool.exec(test)
          ]);

          assert.deepStrictEqual(pool.stats(), {totalWorkers: 4, busyWorkers: 4, idleWorkers: 0, pendingTasks: 2, activeTasks: 4});

          return all;
        })
        .then(function () {
          assert.deepStrictEqual(pool.stats(), {totalWorkers: 4, busyWorkers: 0, idleWorkers: 4, pendingTasks: 0, activeTasks: 0 });

          return pool.exec(testError)
        })
        .catch(function () {
          assert.deepStrictEqual(pool.stats(), {totalWorkers: 4, busyWorkers: 0, idleWorkers: 4, pendingTasks: 0, activeTasks: 0});
        });

    assert.deepStrictEqual(pool.stats(), {totalWorkers: 1, busyWorkers: 1, idleWorkers: 0, pendingTasks: 0, activeTasks: 1});

    return promise.then(function () {
      return pool.terminate();
    });
  });

  it('should throw an error in case of wrong type of arguments in function exec', function () {
    var pool = new Pool();
    assert.throws(function () {pool.exec()}, TypeError);
    assert.throws(function () {pool.exec(23)}, TypeError);
    assert.throws(function () {pool.exec(add, {})}, TypeError);
    assert.throws(function () {pool.exec(add, 2, 3)}, TypeError);
    assert.throws(function () {pool.exec(add, 'a string')}, TypeError);
  });

  it('should throw an error when the tasks queue is full', function () {
    var pool = new Pool({maxWorkers: 2, maxQueueSize: 3});

    function add(a, b) {
      return a + b;
    }

    assert.strictEqual(pool.tasks.length, 0);
    assert.strictEqual(pool.workers.length, 0);

    var task1 = pool.exec(add, [3, 4]);
    var task2 = pool.exec(add, [2, 3]);

    assert.strictEqual(pool.tasks.length, 0);
    assert.strictEqual(pool.workers.length, 2);

    var task3 = pool.exec(add, [5, 7]);
    var task4 = pool.exec(add, [1, 1]);
    var task5 = pool.exec(add, [6, 3]);

    assert.strictEqual(pool.tasks.length, 3);
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
          assert.strictEqual(pool.tasks.length, 0);
          assert.strictEqual(pool.workers.length, 2);

          return pool.terminate();
        });
  });

});

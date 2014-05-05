var assert = require('assert'),
    Promise = require('bluebird'),
    WorkerHandler = require('../lib/WorkerHandler');

function add(a, b) {
  return a + b;
}

describe('WorkerHandler', function () {

  it('should handle a request', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', {
          fn: add + '', // stringified function
          args: [2, 4]
        })
        .then(function (result) {
          assert.equal(result, 6);
          done();
        })
  });

  it('should handle multiple requests at once', function (done) {
    var handler = new WorkerHandler();

    var task1 = handler.exec('run', {fn: add + '', args: [2, 4]});
    var task2 = handler.exec('run', {fn: add + '', args: [4, 7]});

    Promise.all([task1, task2])
        .then(function (results) {
          assert.deepEqual(results, [6, 11]);
          done();
        })
  });

  it('should test whether a worker is available', function (done) {
    var handler = new WorkerHandler();

    assert.equal(handler.busy(), false);

    handler.exec('run', {
          fn: add + '', // stringified function
          args: [2, 4]
        })
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

    handler.exec('run', {
          fn: add + '', // stringified function
          args: [2, 4]
        })
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

    handler.exec('run', {
          fn: add + '', // stringified function
          args: [2, 4]
        })
        .then(function (result) {
          assert('Should not complete request');
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: Worker terminated');
          done();
        });

    var force = true;
    handler.terminate(force);

    assert.equal(handler.terminated, true);
  });

  it('handle a promise based result', function (done) {
    var handler = new WorkerHandler();

    function asyncAdd(a, b) {
      var Promise = require('bluebird');

      return new Promise(function (resolve, reject) {
        if (typeof a === 'number' && typeof b === 'number') {
          resolve(a + b);
        }
        else {
          reject(new TypeError('Invalid input, two numbers expected'))
        }
      });
    }

    handler.exec('run', {
          fn: asyncAdd + '', // stringified function
          args: [2, 4]
        })
        .then(function (result) {
          assert.equal(result, 6);

          handler.exec('run', {
                fn: asyncAdd + '', // stringified function
                args: [2, 'oops']
              })
              .catch(function (err) {
                assert.equal(err, 'TypeError: Invalid input, two numbers expected');
                done();
              });
        });
  });

  it.skip('create a worker handler with custom script', function () {
    // TODO
  });

  it('should handle errors thrown by a worker (1)', function (done) {
    var handler = new WorkerHandler();

    function test() {
      throw new TypeError('Test error');
    }

    handler.exec('run', {
          fn: test + ''
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'TypeError: Test error');

          done();
        });
  });

  it('should handle errors thrown by a worker (2)', function (done) {
    var handler = new WorkerHandler();

    function test() {
      return test();
    }

    handler.exec('run', {
          fn: test + ''
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'RangeError: Maximum call stack size exceeded');

          done();
        });
  });

  it('should handle crashing of a worker (1)', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', {
          fn: add + '',
          params: [2, 4]
        })
        .then(function () {
          assert('Promise should not be resolved');
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: Worker terminated unexpectedly');

          done();
        });

    // to fake a problem with a worker, we disconnect it
    handler.worker.disconnect();
  });

  it('should handle crashing of a worker (2)', function (done) {
    var handler = new WorkerHandler();

    handler.exec('run', {
          fn: add + '',
          params: [2, 4]
        })
        .then(function () {
          assert('Promise should not be resolved');
        })
        .catch(function (err) {
          assert.equal(err.toString(), 'Error: Worker terminated unexpectedly');

          done();
        });

    // to fake a problem with a worker, we kill it
    handler.worker.kill();

  });

  it.skip('should handle crashing of a worker (3)', function (done) {
    // TODO: create a worker from a script, which really crashes itself
  });

});
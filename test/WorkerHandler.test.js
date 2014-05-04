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

  it.skip('create a worker handler with custom script', function () {
    // TODO
  });

  it.skip('should handle a crashing worker', function () {
    // TODO
  });

});
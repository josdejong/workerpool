var assert = require('assert'),
    Promise = require('bluebird'),
    Pool = require('../lib/Pool');

describe('Pool', function () {

  it('should offload a function to a worker', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function add(a, b) {
      return a + b;
    }

    assert.equal(pool.workers.length, 0);

    pool.run(add, [3, 4])
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
          pool.run(add, [3, 4]),
          pool.run(add, [2, 3])
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

    var task1 = pool.run(add, [3, 4]);
    var task2 = pool.run(add, [2, 3]);

    assert.equal(pool.tasks.length, 0);
    assert.equal(pool.workers.length, 2);

    var task3 = pool.run(add, [5, 7]);
    var task4 = pool.run(add, [1, 1]);

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

  it('should handle errors thrown by a worker', function (done) {
    var pool = new Pool({maxWorkers: 10});

    function test() {
      throw new TypeError('Test error');
    }

    pool.run(test)
        .catch(function (err) {
          assert.equal(err.toString(), 'TypeError: Test error');

          pool.clear();
          done();
        });
  });

  it('should clear all workers', function (done) {
    var pool = new Pool({maxWorkers: 10});

    assert.equal(pool.workers.length, 0);

    function test() {
      return 'ok';
    }

    pool.run(test)
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

    pool.run(test)
        .then(function (result) {
          assert.equal(result, 'ok');

          assert.equal(pool.workers.length, 0);

          done();
        });

    assert.equal(pool.workers.length, 1);

    pool.clear();

    assert.equal(pool.workers.length, 0);
  });

});
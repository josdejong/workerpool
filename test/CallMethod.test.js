var assert = require('assert');
var Pool = require('../src/Pool');

it('creates a worker pool with event callbacks', function (done) {
  const pool = new Pool(__dirname + "/workers/waitForMessage.js");
  
  const handler = pool.exec('fibonacci', [15]);

  handler
  .then(function (result) {
    assert.strictEqual(result, 610);
  })
  .catch(function (err) {
    console.error(err);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
    done();
  })
  .catch(done);
});

it('creates a worker pool and sends a message', function (done) {
  const pool = new Pool(__dirname + "/workers/waitForMessage.js");
  
  const handler = pool.exec('fibonacci', [15]);

  handler
  .then(function (result) {
    assert.strictEqual(result, 610);
  })
  .catch(function (err) {
    assert.strictEqual(err.toString().includes('exitCode: `99`'), true);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
    done();
  })
  .catch(done);
  
  handler.emit('killme', 99); // forces the worker to exit with exitcode 99
});

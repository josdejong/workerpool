var workerpool = require('./../index');

// create a worker pool using an the asyncWorker. This worker contains
// asynchronous functions.
var pool = workerpool.pool(__dirname + '/workers/asyncWorker.js');


pool.proxy().then(function (worker) {
  worker.asyncAdd(3, 4.1)
      .then(function (result) {
        console.log(result);

        pool.clear(); // clear all workers when done
      });
});

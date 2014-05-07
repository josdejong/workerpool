var workerpool = require('./../index');

// create a worker pool
var pool = workerpool.pool(__dirname + '/workers/nodeWorker.js');

// create a proxy
pool.proxy()
    .then(function (proxy) {
      // execute a function via the proxy
      proxy.multiply(2, 5)
          .then(function (result) {
            console.log('Result: ' + result); // outputs 10

            pool.clear(); // clear all workers when done
          });
    });

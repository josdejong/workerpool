var workerpool = require('./../index');

var pool = workerpool.pool();

function add(a, b) {
  return a + b;
}

pool.run(add, [3, 4])
    .then(function (result) {
      console.log('result', result); // outputs 7

      pool.clear(); // clear all workers when done
    });

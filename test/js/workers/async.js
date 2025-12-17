// a worker which does initialization asynchronously
var workerpool = require('../../../');

function add(a, b) {
  return a + b;
}

setTimeout(function() {
  // create a worker and register some functions
  workerpool.worker({
    add: add
  });
}, 500);

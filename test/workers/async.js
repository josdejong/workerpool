// a worker which does initialization asynchronously
const workerpool = require('../../index');

function add(a, b) {
  return a + b;
}

setTimeout(() => {
  // create a worker and register some functions
  workerpool.worker({ add: add });
}, 500);

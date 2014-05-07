// a simple worker
var workerpool = require('../../index');

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

// create a worker and register some functions
workerpool.worker({
  add: add,
  multiply: multiply
});

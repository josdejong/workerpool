// a simple worker for use in node.js (as a child process)

// load workerpool
var workerpool = require('../../index');

// define some functions
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

// a simple worker for use in the browser (as Web Worker)

// load workerpool
importScripts('../../dist/workerpool.js');

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

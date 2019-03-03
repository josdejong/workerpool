// a simple worker
const workerpool = require('../../index');

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function timeout(delay) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve('done'), delay)
  });
}

// create a worker and register some functions
workerpool.worker({
  add: add,
  multiply: multiply,
  timeout: timeout
});

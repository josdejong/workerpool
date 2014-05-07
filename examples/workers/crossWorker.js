// a simple worker which can be used both in node.js and in the browser
// only the load process differs for node.js and web workers

// load workerpool
if (typeof importScripts === 'function') {
  // web worker
  importScripts('../../dist/workerpool.js');
}
else {
  // node.js
  var workerpool = require('../../index');
}

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

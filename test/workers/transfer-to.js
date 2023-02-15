// a simple worker
var workerpool = require("../../");

function transfer(array) {
  return array.byteLength;
}

// create a worker and register some functions
workerpool.worker({
  transfer: transfer,
});

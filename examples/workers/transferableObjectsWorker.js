// a simple worker
var workerpool = require("../../");

function transfer(array) {
  return array.byteLength; // return the length of the transfered array
}

// create a worker and register some functions
workerpool.worker({
  transfer: transfer,
});

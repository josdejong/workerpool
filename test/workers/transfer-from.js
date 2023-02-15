// a simple worker
var workerpool = require("../../");

function transfer(size) {
  var array = new Uint8Array(size).map((_v, i) => i);
  return new workerpool.Transfer(array, [array.buffer]);
}

// create a worker and register some functions
workerpool.worker({
  transfer: transfer,
});

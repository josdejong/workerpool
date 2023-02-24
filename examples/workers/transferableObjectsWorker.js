// a simple worker
var workerpool = require("../../");

function transferTo(array) {
  return array.byteLength; // return the length of the transferred array
}

function transferBack(array) {
  // transfer an array back to the main thread
  return new workerpool.Transfer({ array, byteLength: array.byteLength }, [
    array.buffer,
  ]);
}

// create a worker and register some functions
workerpool.worker({
  transferTo: transferTo,
  transferBack: transferBack,
});

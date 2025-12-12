var workerpool = require('../../');

// Test returning a Transfer object from an async function (covers lines 283-287)
function asyncTransfer(size) {
  return new Promise(function(resolve) {
    var array = new Uint8Array(size).map(function(_, i) { return i; });
    // Transfer takes (message, transferList) - message is what gets returned
    resolve(new workerpool.Transfer(array, [array.buffer]));
  });
}

// Test emitting a Transfer object (covers lines 366-372)
function emitTransfer(size) {
  var array = new Uint8Array(size).map(function(_, i) { return i; });
  workerpool.workerEmit(new workerpool.Transfer({
    type: 'transfer',
    data: Array.from(array)
  }, [array.buffer]));
  return 'emitted';
}

workerpool.worker({
  asyncTransfer: asyncTransfer,
  emitTransfer: emitTransfer
});

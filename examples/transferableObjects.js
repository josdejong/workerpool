var workerpool = require("..");

// create a worker pool using an external worker script
var pool = workerpool.pool(__dirname + "/workers/transferableObjectsWorker.js");

// create a transferable objects of 1KB
var toTransfer = new Uint8Array(1024).map((_v, i) => i);
var toCopy = new Uint8Array(1024).map((_v, i) => i);

// run functions on the worker via exec
Promise.all([
  pool
    .exec("transfer", [toTransfer], { transferList: [toTransfer.buffer] })
    .then(function (result) {
      console.log('With "transferList":');
      console.log("Transferred buffer size: " + result); // outputs 1024
      console.log("Original buffer size: " + toTransfer.byteLength); // outputs 0
    }),
  pool.exec("transfer", [toCopy]).then(function (result) {
    console.log('Without "transferList":');
    console.log("Transferred buffer size: " + result); // outputs 1024
    console.log("Original buffer size: " + toCopy.byteLength); // outputs 1024
  }),
])
  .catch(function (err) {
    console.error(err);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
  });

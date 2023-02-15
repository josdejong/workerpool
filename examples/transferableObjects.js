const workerpool = require("..");

// create a worker pool using an external worker script
const pool = workerpool.pool(
  __dirname + "/workers/transferableObjectsWorker.js"
);

// create a transferable objects of 1KB
const newArray = () => new Uint8Array(1024).map((_v, i) => i);
const toTransfer = newArray();
const toCopy = newArray();
const toTransferAndReceive = newArray();

// run functions on the worker via exec
Promise.all([
  pool
    .exec("transferTo", [toTransfer], { transfer: [toTransfer.buffer] })
    .then(function (result) {
      console.log('With "transfer":');
      console.log("Transferred buffer size: " + result); // outputs 1024
      console.log("Original buffer size: " + toTransfer.byteLength); // outputs 0
      console.log("\n");
    }),
  pool.exec("transferTo", [toCopy]).then(function (result) {
    console.log('Without "transfer":');
    console.log("Transferred buffer size: " + result); // outputs 1024
    console.log("Original buffer size: " + toCopy.byteLength); // outputs 1024
    console.log("\n");
  }),
  pool
    .exec("transferBack", [toTransferAndReceive], {
      transfer: [toTransferAndReceive.buffer],
    })
    .then(function (result) {
      console.log("Transfer back and forth:");
      console.log("Buffer size in worker: " + result.byteLength); // outputs 1024
      console.log("Buffer size in main thread: " + result.array.byteLength); // outputs 1024
      console.log("Original buffer size: " + toTransferAndReceive.byteLength); // outputs 0
      console.log("\n");
    }),
])
  .catch(function (err) {
    console.error(err);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
  });

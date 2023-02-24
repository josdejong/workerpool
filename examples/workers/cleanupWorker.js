// Example of a worker that cleans up when it is terminated.

var workerpool = require("../..");

function asyncAdd(a, b) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      resolve(a + b);
    }, 500);
  });
}

// create a worker and register public functions
workerpool.worker(
  {
    asyncAdd: asyncAdd,
  },
  {
    // This function is called when the worker is terminated.
    // It can be used to clean up any open connections or resources.
    // May return a promise, in such case make sure that pool's option
    // `workerTerminateTimeout` is set to a value larger than the time it takes to clean up.
    onTerminate: function (code) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          console.log("Inside worker cleanup finished (code = " + code + ")");
          resolve();
        }, 500);
      });
    },
  }
);

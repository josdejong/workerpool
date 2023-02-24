var workerpool = require("../..");

var port;

function asyncAdd(a, b, c) {
  port = c;
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(a + b);
    }, 100);
  });
}

// create a worker and register public functions
workerpool.worker(
  {
    asyncAdd: asyncAdd,
  },
  {
    onTerminate: function (code) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          port.postMessage(code);
          resolve();
        }, 100);
      });
    },
  }
);

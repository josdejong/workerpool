var workerpool = require("../..");

var port;

function asyncAdd(a, b, c) {
  port = c;
  return new Promise(function (resolve) {
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
    onTerminate: function (code) {
      port.postMessage(code);
    }
  }
);

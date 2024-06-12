var workerpool = require("../..");

function asyncTimeout() {
    return new Promise(function (resolve) {

        let timeout = setTimeout(function () {
            resolve();
        }, 5000);
        workerpool.addAbortListener(function () {
            clearTimeout(timeout);
            resolve();
        });
    });
}

// create a worker and register public functions
workerpool.worker(
  {
    asyncTimeout: asyncTimeout,
  }
);
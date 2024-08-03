var workerpool = require("../..");

function asyncTimeout() {
  var me = this;
  return new Promise((resolve) => {
    let timeout = setTimeout(() => {
        resolve();
    }, 5000); 

    me.worker.addAbortListener(async function () {

        clearTimeout(timeout);
        resolve();
        await Promise.resolve();
    });
  });
}

function asyncAbortHandlerNeverResolves() {
  var me = this;
  return new Promise((resolve) => {
    let timeout = setTimeout(() => {
        resolve();
    }, 5000); 
    me.worker.addAbortListener(function () {
      clearTimeout(timeout);
      return new Promise((res) => {
        setTimeout(() => {
          res();
          resolve();
        // set the timeout high so it will not resolve before the external
        // timeout triggers and exits the worker 
        }, 1000000000);
      });
    });
  });
}

// create a worker and register public functions
workerpool.worker(
  {
    asyncTimeout: asyncTimeout,
    asyncAbortHandlerNeverResolves: asyncAbortHandlerNeverResolves,
  },
  {
    abortListenerTimeout: 1000
  }
);
var workerpool = require("../..");

function asyncTimeout() {
  var me = this;
  return new Promise(function (resolve) {
    let timeout = setTimeout(() => {
        resolve();
    }, 5000);
    me.worker.addAbortListener(async function () {
        clearTimeout(timeout);
        resolve();
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
        }, 1_000_000_000);
      });
    });
  });
}

function stdoutStreamOnAbort() {
  var me = this;
  return new Promise(function (resolve) {
    me.worker.addAbortListener(async function () {
        console.log("Hello, world!");
        resolve();
    });
  });
}

function eventEmitOnAbort() {
  var me = this;
  return new Promise(function (resolve) {
    me.worker.addAbortListener(async function () {
        workerpool.workerEmit({
          status: 'cleanup_success',
        });
        resolve();
    });
  });
}


// create a worker and register public functions
workerpool.worker(
  {
    asyncTimeout: asyncTimeout,
    asyncAbortHandlerNeverResolves: asyncAbortHandlerNeverResolves,
    stdoutStreamOnAbort: stdoutStreamOnAbort,
    eventEmitOnAbort: eventEmitOnAbort,
  },
  {
    abortListenerTimeout: 1000
  }
);
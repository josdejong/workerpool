var workerpool = require('../../../');

// test the value of isMainThread from a worker
workerpool.worker({
  isMainThread: function () {
    return workerpool.isMainThread
  }
});

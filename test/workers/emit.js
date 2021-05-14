// a simple worker
var workerpool = require('../../');

function sendEvent() {
  return new Promise(function (resolve, reject) {
    workerpool.workerEmit({
      foo: 'bar'
    });
    resolve('done');
  });
}

// create a worker and register some functions
workerpool.worker({
  sendEvent: sendEvent
});

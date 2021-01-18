// a simple worker
var workerpool = require('../../');

function sendEvent() {
  return new Promise(function (resolve, reject) {
    workerpool.workerEmit('test-event', {
      foo: 'bar'
    });
    resolve('done');
  });
}

// create a worker and register some functions
workerpool.worker({
  sendEvent: sendEvent
});

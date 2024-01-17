// a simple worker
var workerpool = require('../..');

function stdStreams() {
  console.log("stdout message")
  console.error("stderr message")
  return new Promise(function (resolve, reject) {
    resolve('done');
  });
}

// create a worker and register some functions
workerpool.worker({
  stdStreams: stdStreams,
});

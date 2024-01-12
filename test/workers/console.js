// a simple worker
var workerpool = require('../../');

function stdout() {
  console.log("stdout message")
  return new Promise(function (resolve, reject) {
    resolve('done');
  });
}

function stderr() {
    console.error("stderr message")
    return new Promise(function (resolve, reject) {
      resolve('done');
    });
  }

// create a worker and register some functions
workerpool.worker({
    stdout: stdout,
    stderr: stderr
});

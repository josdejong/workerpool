var workerpool = require('..');

// create a worker pool using an the consoleWorker. This worker contains
// console.log & console.error functions.
var pool = workerpool.pool(__dirname + '/workers/consoleWorker.js', {emitStdStreams: true});


pool.exec('stdStreams', [], {
    on: function (payload) {
      if (payload.stdout) {
        console.log(`captured stdout: ${payload.stdout.trim()}`) // outputs 'captured stdout: stdout message'
      }
      if (payload.stderr) {
        console.log(`captured stderr: ${payload.stderr.trim()}`) // outputs 'captured stderr: stderr message'
      }
    }})
    .then(function () {
      pool.terminate(); // terminate all workers when done
    });


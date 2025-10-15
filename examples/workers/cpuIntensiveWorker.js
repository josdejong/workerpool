// Example of a CPU-intensive worker that never shuts down

var workerpool = require('../..');

function cpuIntensive () {
  return new Promise(function (resolve, reject) {
    while(true) {
      process.stdout.write(".");
      for (let i = 0; i < 1e8; i++) {}
    }
    resolve({})
  });
}

workerpool.worker({
  cpuIntensive: cpuIntensive,
});

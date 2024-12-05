const workerpool = require("..");
const limiter = require("cpulimit"); // need npm install cpulimit

// create a worker pool
const pool = workerpool.pool(__dirname + "/workers/cpuIntensiveWorker.js", {
  // cpu limit is supported for process worker
  workerType: "process",
  workerTerminateTimeout: 1000,
  onCreatedWorker: (worker) => {
      const cpuLimitOption = {
          limit: 50,
          includeChildren: true,
          pid: worker.worker.pid
      };
      limiter.createProcessFamily(cpuLimitOption, function(err, processFamily) {
          if(err) {
              console.error('Error:', err.message);
              return;
          }

          limiter.limit(processFamily, cpuLimitOption, function(err) {
              if(err) {
                  console.error('Error:', err.message);
              }
              else {
                  console.log('Done.');
              }
          });
      });
  }
});

const main = async () => {
  try {
    await pool
      .exec("cpuIntensive", [])
      .timeout(10000)
  } catch(err) {
    console.log('Timeout')
  }
  await pool.terminate()
};

main();

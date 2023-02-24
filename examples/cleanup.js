const workerpool = require("..");

// create a worker pool
const pool = workerpool.pool(__dirname + "/workers/cleanupWorker.js", {
  // cleanup is only supported for threads or processes
  workerType: "thread",
  // maximum time to wait for worker to cleanup it's resources
  // on termination before forcefully stopping the worker
  workerTerminateTimeout: 1000,
});

const main = async () => {
  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let c = 0;
  const task = () =>
    pool
      .exec("asyncAdd", [c++, 4.1])
      .then(function (result) {
        console.log(result);
      })
      .catch(function (err) {
        console.error(err);
      });

  const tasks = [
    task(),
    timeout(50).then(() => task()),
    timeout(100).then(() => task()),
  ];

  // Will print `Inside worker cleanup finished (code = 0)` three times
  await Promise.all(tasks).then(() => pool.terminate());
};

main();

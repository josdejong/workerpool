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

  // Only first task is executed, the rest won't run
  // because the process exits before they are even scheduled
  const tasks = [
    task(),
    timeout(1000).then(() => task()),
    timeout(1050).then(() => task()),
  ];

  // Simulate SIGINT signal
  timeout(500)
    .then(() => pool.terminate())
    .then(() => {
      console.log("pool terminated");
      process.exit(0);
    });

  await Promise.all(tasks);
};

main();

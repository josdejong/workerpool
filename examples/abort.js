const workerpool = require("..");

// create a worker pool
const pool = workerpool.pool(__dirname + "/workers/cleanupAbort.js", {
  // maximum time to wait for worker to cleanup it's resources
  // on termination before forcefully stopping the worker
  workerTerminateTimeout: 1000,
  onCreateWorker: function (args) {
    console.log("New worker created");
  },
  onTerminateWorker: function () {
    console.log("worker terminated");
  },
  maxWorkers: 1,
});

const main = async function() {
  let abortResolverSuccess;
  await pool
    .exec("asyncTimeout", [], {
        onAbortResolution: function (args) {
          console.log("abort operation concluded for task:", args.id);
          console.log("is worker terminating", args.isTerminating);
        },
        onAbortStart: async function (args) {
          console.log(
            "abort operation started from task timeout, in onAbortStart",
          );
          abortResolverSuccess = args.abortPromise;
      },
    })
    .timeout(100)
    .catch((err) => {
      console.log("timeout handled: ", err.message);
    });

  await abortResolverSuccess.then((err) => {
    console.log("abort operation resolved for asyncTimeout");
  });

  console.log("pool status after abort operation:", pool.stats());

  let abortResolverFailure;
  await pool
    .exec("asyncAbortHandlerNeverResolves", [], {
      onAbortStart: function (args) {
        console.log(
          "abort operation started from task cancel, in onAbortStart",
        );
        abortResolverFailure = args.abortPromise;
      },
      onAbortResolution: function (args) {
        console.log("abort operation concluded for task:", args.id);
        console.log("is worker terminating", args.isTerminating);
        console.log("no min workers are set, no new worker should be created");
      }
    })
    .cancel()
    .catch((err) => {
      console.log("task canceled");
      console.log("cancel occured: ", err.message);
    });


  await abortResolverFailure.then(() => {
    console.log("cancelation handled for asyncAbortHandlerNeverResolves");
  });

  console.log("final pool stats", pool.stats());
  // we dont need to terminate the pool, since all workers should be terminated by this point even though there is a handler.
};

main();

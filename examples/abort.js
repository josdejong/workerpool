const workerpool = require("..");

// create a worker pool
const pool = workerpool.pool(__dirname + "/workers/cleanupAbort.js", {
  // maximum time to wait for worker to cleanup it's resources
  // on termination before forcefully stopping the worker
  workerTerminateTimeout: 1000,
  onCreateWorker: function (args) {
    console.log("New worker created");
  },
  onAbortResolution: function(args) {
    console.log("abort operation concluded for task:", args.id);
    console.log("is worker terminating", args.isTerminating);
  },
  onTerminateWorker: function() {
    console.log("worker terminated");
  },
  maxWorkers: 1,
});

function add (a, b) {
    return a + b;
}

const main = async () => {
    let abortResolverSuccess;
    await pool.exec('asyncTimeout', [], {
        onAbortStart: async function(args) {
            console.log("abort operation started");
            abortResolverSuccess = args.taskResolver.promise;
        }
    }).timeout(100).catch((err) => {
        console.log("timeout occured: ", err.message);
    });

    await abortResolverSuccess.catch((err) => {
        console.log("", err);
    });

    console.log("pool status after abort operation:", pool.stats());
    

    let abortResolverFailure;
    await pool.exec('asyncAbortHandlerNeverResolves', [], {
        onAbortStart: function(args) {
            console.log("abort operation started");
            abortResolverFailure = args.taskResolver.promise;
        }
    }).cancel().catch((err) => {
        console.log("task canceled");
        console.log("cancel occured: ", err.message);
    });

    console.log("final pool stats", pool.stats());
    // we dont need to terminate the pool, since all workers should be terminated by this point even though there is a handler.
}

main();

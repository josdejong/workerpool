const workerpool = require("..");

var workerCount = 0;

// create a worker pool
const pool = workerpool.pool(__dirname + "/workers/cleanupAbort.js", {
  // maximum time to wait for worker to cleanup it's resources
  // on termination before forcefully stopping the worker
  workerTerminateTimeout: 1000,
  onCreateWorker: (args) => {
    console.log("New worker created");
    workerCount += 1;
  }
});

function add (a, b) {
    return a + b;
}

const main = async () => {
    const cleanedUpTask = pool.exec('asyncTimeout', []).timeout(1_000).catch((err) => {
        console.log("task timeout");
        console.log("timeout occured: ", err.message);
        console.log("worker count ", workerCount);
        return pool.exec(add, [1, 2]).then((sum) => {
            console.log('add result', sum);
            console.log("worker count: ", workerCount);
        });
    });
    await cleanedUpTask;

    const canceledTask = pool.exec('asyncAbortHandlerNeverResolves').cancel().catch((err) => {
        console.log("task canceled");
        console.log("cancel occured: ", err.message);
        console.log("worker count ", workerCount);
        return pool.exec(add, [1, 2]).then((sum) => {
            console.log('add result', sum);
            console.log("worker count: ", workerCount);
        }); 
    });

    await canceledTask;
}


main();

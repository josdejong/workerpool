var workerpool = require('..');

var counter = 0;
var terminatedWorkers = [];

var pool = workerpool.pool(__dirname + '/workers/dynamicOptionsWorker.js', {
  workerType: 'process',
  maxWorkers: 4,
  onCreateWorker: (opts) => {
    return {
      ...opts,
      forkOpts: {
        ...opts.forkOpts,
        env: {
          UNIQUE_WORKER_ID: `worker_id_${counter++}`
        }
      }
    }
  },
  onTerminateWorker: (opts) => {
    terminatedWorkers.push(opts.forkOpts.env.UNIQUE_WORKER_ID);
  }
});

// Fire four requests in parallel. This will spawn four workers,
// each with a unique environment variable UNIQUE_WORKER_ID
Promise.all([
  pool.exec('getUniqueWorkerId', []),
  pool.exec('getUniqueWorkerId', []),
  pool.exec('getUniqueWorkerId', []),
  pool.exec('getUniqueWorkerId', [])
])
  .catch(function (err) {
    console.error(err);
  })
  .then(function (workerIds) {
    console.log('returned id\'s: ', workerIds)

    return pool.terminate(); // terminate all workers when done
  })
  .then(() => {
    console.log('Terminated workers: ', terminatedWorkers)
  });

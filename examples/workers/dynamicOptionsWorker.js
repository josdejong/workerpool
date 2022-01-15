var workerpool = require('../..');

// this function reads an environment variable.
// This variable can be set dynamically per worker using onCreateWorker
function getUniqueWorkerId() {
  return process.env.UNIQUE_WORKER_ID
}

workerpool.worker({
  getUniqueWorkerId: getUniqueWorkerId
});

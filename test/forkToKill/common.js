var workerpool = require('../../');
var path = require('path');

var pool = workerpool.pool(path.join(__dirname, '../workers/interval.js'), {
  maxWorkers: 1,
  nodeWorker: 'process'
});

process.send && process.send({
  workerPid: pool._getWorker().worker.pid
});
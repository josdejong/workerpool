const {platform, isMainThread, cpus} = require('./environment');

/**
 * Create a new worker pool
 * @param {string} [script]
 * @param {import("./types.js").WorkerPoolOptions} [options]
 * @returns {Pool} pool
 */
function pool(script, options) {
  var Pool = require('./Pool');

  return new Pool(script, options);
};
exports.pool = pool;

/**
 * Create a worker and optionally register a set of methods to the worker.
 * @param {{ [k: string]: (...args: any[]) => any }} [methods]
 * @param {import("./types.js").WorkerRegisterOptions} [options]
 */
function worker(methods, options) {
  var worker = require('./worker');
  worker.add(methods, options);
};
exports.worker = worker;

/**
 * Sends an event to the parent worker pool.
 * @param {any} payload 
 */
function workerEmit(payload) {
  var worker = require('./worker');
  worker.emit(payload);
};
exports.workerEmit = workerEmit;

exports.Promise = require('./Promise');

exports.Transfer = require('./transfer');

exports.platform = platform;
exports.isMainThread = isMainThread;
exports.cpus = cpus;

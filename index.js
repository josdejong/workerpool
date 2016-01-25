var isBrowser = (typeof window !== 'undefined');

/**
 * Create a new worker pool
 * @param {Object} [options]
 * @returns {Pool} pool
 */
exports.pool = function pool(script, options) {
  var Pool = require('./lib/Pool');

  return new Pool(script, options);
};

/**
 * Create a worker and optionally register a set of methods to the worker.
 * @param {Object} [methods]
 */
exports.worker = function worker(methods) {
  var environment = require('./lib/environment');
  if (environment == 'browser') {
    // worker is already loaded by requiring worker

    // use embedded worker.js
    var blob = new Blob([require('./lib/generated/embeddedWorker')], {type: 'text/javascript'});
    var url = window.URL.createObjectURL(blob);
    importScripts(url);
  }
  else {
    // node
    // TODO: do not include worker in browserified library
    var worker = require('./lib/worker');
  }

  worker.add(methods);
};

/**
 * Create a promise.
 * @type {Promise} promise
 */
exports.Promise = require('./lib/Promise');

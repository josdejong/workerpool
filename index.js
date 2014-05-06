var isBrowser = (typeof window !== 'undefined');

/**
 * Create a new worker pool
 * @param {Object} [options]
 * @returns {Pool} pool
 */
exports.pool = function pool(options) {
  var Pool = require('./lib/Pool');

  return new Pool(options);
};

exports.worker = function worker(exports) {
  // TODO: implement worker
};

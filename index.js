var isBrowser = (typeof window !== 'undefined');

if (isBrowser) {
  // browser environment
  // TODO: implement browser support
  throw new Error('Sorry, browser support is not yet implemented...');
}
else {
  // node.js environment

  /**
   * Create a new worker pool
   * @param {Object} [options]
   * @returns {Pool} pool
   */
  exports.pool = function pool(options) {
    var Pool = require('./lib/Pool');

    return new Pool(options);
  };

  exports.worker = function worker() {

  }
}

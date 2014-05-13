'use strict';

/**
 * Promise
 *
 * Inspired by https://gist.github.com/RubaXa/8501359 from RubaXa <trash@rubaxa.org>
 *
 * @param {Function} handler   Called as handler(resolve: Function, reject: Function)
 * @param {Promise} [parent]   Parent promise for propagation of cancel and timeout
 */
function Promise(handler, parent) {
  var me = this;

  if (!(this instanceof Promise)) {
    throw new SyntaxError('Constructor must be called with the new operator');
  }

  if (typeof handler !== 'function') {
    throw new SyntaxError('Function parameter handler(resolve, reject) missing');
  }

  var _onSuccess = [];
  var _onFail = [];

  /* TODO: use process
  var process = function (callback, queue) {
    queue.push(callback);
  };
  */

  /**
   * Add an onSuccess callback and optionally an onFail callback to the Promise
   * @param {Function} onSuccess
   * @param {Function} [onFail]
   * @returns {Promise} promise
   */
  this.then = function (onSuccess, onFail) {
    return new Promise(function (resolve, reject) {
      if (onSuccess) {
        _onSuccess.push(_then(onSuccess, resolve, reject));
      }
      else {
        _onSuccess.push(resolve);
      }
      if (onFail) {
        _onFail.push(_then(onFail, resolve, reject))
      }
      else {
        _onFail.push(reject);
      }
    }, me);
  };

  // TODO: simplify resolve, reject, and _then

  /**
   * @type {Function}
   */
  var resolve = function (result) {
    _onSuccess.forEach(function (fn) {
      fn(result);
    });

    me.then = function (onSuccess, onFail) {
      return new Promise(function (resolve, reject) {
        if (onSuccess) {
          _then(onSuccess, resolve, reject)(result);
        }
        else {
          resolve(result);
        }
      }, me)
    };

    resolve = reject = function () {
      throw new Error('Promise is already resolved');
    };

    return me;
  };

  /**
   * @type {Function}
   */
  var reject = function (error) {
    _onFail.forEach(function (fn) {
      fn(error);
    });

    me.then = function (onSuccess, onFail) {
      return new Promise(function (resolve, reject) {
        if (onFail) {
          _then(onFail, resolve, reject)(error);
        }
        else {
          reject(error);
        }
      }, me)
    };

    resolve = reject = function () {
      throw new Error('Promise is already resolved');
    };

    return me;
  };

  /**
   * Cancel te promise. This will reject the promise with a CancellationError
   * @returns {Promise} self
   */
  this.cancel = function () {
    if (parent) {
      parent.cancel();
    }
    else {
      reject(new CancellationError());
    }
    return me;
  };

  /**
   * Set a timeout for the promise. If the promise is not resolved within
   * the time, the promise will be cancelled and a TimeoutError is thrown.
   * If the promise is resolved in time, the timeout is removed.
   * @param {number} delay     Delay in milliseconds
   * @returns {Promise} self
   */
  this.timeout = function (delay) {
    if (parent) {
      parent.timeout(delay);
    }
    else {
      var timer = setTimeout(function () {
        reject(new TimeoutError('Promise timed out after ' + delay + ' ms'));
      }, delay);

      return me.always(function () {
        clearTimeout(timer);
      });
    }

    return me;
  };

  // attach handler passing the resolve and reject functions
  handler(function (result) {
    resolve(result);
  }, function (error) {
    reject(error);
  });
}

/**
 * Function to be executed
 * @param {Function} callback
 * @param {Function} resolve
 * @param {Function} reject
 * @returns {Function.<result>}
 * @private
 */
function _then(callback, resolve, reject) {
  return function (result) {
    try {
      var res = callback(result);
      if (res && typeof res.then === 'function' && typeof res['catch'] === 'function') {
        // method returned a promise
        res.then(resolve, reject);
      }
      else {
        resolve(res);
      }
    }
    catch (error) {
      reject(error);
    }
  }
}

/**
 * Add an onFail callback to the Promise
 * @param {Function} onFail
 * @returns {Promise} promise
 */
Promise.prototype['catch'] = function (onFail){
  return this.then(null, onFail);
};

/**
 * Execute given callback when the promise either resolves or rejects.
 * @param {Function} fn
 * @returns {Promise} promise
 */
Promise.prototype.always = function (fn) {
  return this.then(fn, fn);
};

/**
 * Create a promise which resolves when all provided promises are resolved,
 * and fails when any of the promises resolves.
 * @param {Promise[]} promises
 * @returns {Promise} promise
 */
Promise.all = function (promises){
  return new Promise(function (resolve, reject) {
    var remaining = promises.length,
        results = [];

    if (remaining) {
      promises.forEach(function (p, i) {
        p.then(function (result) {
          results[i] = result;
          remaining--;
          if (remaining == 0) {
            resolve(results);
          }
        }, function (error) {
          remaining = 0;
          reject(error);
        });
      });
    }
    else {
      resolve(results);
    }
  });
};

/**
 * Create a promise resolver
 * @returns {{promise: Promise, resolve: Function, reject: Function}} resolver
 */
Promise.defer = function () {
  var resolver = {};

  resolver.promise = new Promise(function (resolve, reject) {
    resolver.resolve = resolve;
    resolver.reject = reject;
  });

  return resolver;
};

/**
 * Create a cancellation error
 * @param {String} [message]
 * @extends Error
 */
function CancellationError(message) {
  this.message = message || 'promise cancelled';
  this.stack = (new Error()).stack;
}

CancellationError.prototype = new Error();
CancellationError.prototype.constructor = Error;
CancellationError.prototype.name = 'CancellationError';

Promise.CancellationError = CancellationError;


/**
 * Create a timeout error
 * @param {String} [message]
 * @extends Error
 */
function TimeoutError(message) {
  this.message = message || 'timeout exceeded';
  this.stack = (new Error()).stack;
}

TimeoutError.prototype = new Error();
TimeoutError.prototype.constructor = Error;
TimeoutError.prototype.name = 'TimeoutError';

Promise.TimeoutError = TimeoutError;


module.exports = Promise;

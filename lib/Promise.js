'use strict';

/**
 * Promise
 *
 * Inspired by https://gist.github.com/RubaXa/8501359 from RubaXa <trash@rubaxa.org>
 *
 * @param {Function} [handler]   Called as handler(resolve: Function, reject: Function)
 */
function Promise(handler) {
  if (!(this instanceof Promise)) {
    throw new SyntaxError('Constructor must be called with the new operator');
  }

  /**
   * @type {[{onSuccess: Function, onFail: Function}]}
   * @private
   */
  this._queue = [];

  // attach handler passing the resolve and reject functions
  if (typeof handler === 'function') {
    handler(this.resolve.bind(this), this.reject.bind(this));
  }
}

/**
 * Add an onSuccess callback and optionally an onFail callback to the Promise
 * @param {Function} onSuccess
 * @param {Function} [onFail]
 * @returns {Promise} promise
 */
Promise.prototype.then = function (onSuccess, onFail){
  this._queue.push({
    onSuccess: onSuccess,
    onFail: onFail
  });

  return this;
};

/**
 * Add an onFail callback to the Promise
 * @param {Function} onFail
 * @returns {Promise}
 */
Promise.prototype['catch'] = function (onFail){
  return this.then(null, onFail);
};

/**
 * Execute given callback when the promise either resolves or rejects.
 * @param {Function} fn
 * @returns {Promise} self
 */
Promise.prototype.always = function (fn) {
  return this.then(fn, fn);
};

/**
 * Cancel te promise. This will reject the promise with a CancellationError
 * @returns {Promise} self
 */
Promise.prototype.cancel = function () {
  return this.reject(new CancellationError())
};

/**
 * Set a timeout for the promise. If the promise is not resolved within
 * the time, the promise will be cancelled and a TimeoutError is thrown.
 * If the promise is resolved in time, the timeout is removed.
 * @param {number} delay     Delay in milliseconds
 * @returns {Promise} self
 */
Promise.prototype.timeout = function (delay) {
  var me = this;
  var timeout = setTimeout(function () {
    me.reject(new TimeoutError('Promise timed out after ' + delay + ' ms'));
  }, delay);

  return this.always(function () {
    clearTimeout(timeout);
  });
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


/**
 * Resolve the promise
 * @param {*} [result]
 * @returns {Promise} self
 */
Promise.prototype.resolve = function (result) {
  // replace the then function now that the promise is done
  this.then = function (onSuccess) {
    this._queue.push({
      onSuccess: onSuccess
    });
    return this._resolveQueue('onSuccess', result);
  };

  // invoke the result on all onSuccess callbacks
  return this._resolveQueue('onSuccess', result);
};

/**
 * Reject the promise
 * @param {Error} [error]
 * @returns {Promise} self
 */
Promise.prototype.reject = function (error) {
  // replace the then function now that the promise is done
  this.then = function (onSuccess, onFail) {
    this._queue.push({
      onSuccess: onSuccess,
      onFail: onFail
    });
    return this._resolveQueue('onFail', error);
  };

  // invoke the error on all onFail callbacks
  return this._resolveQueue('onFail', error);
};

/**
 * Call all callbacks in the queue
 * @param {String} method    'onSuccess' or 'onFail'
 * @param {* | Error} param  result in case of onSuccess, an Error in case of onFail.
 * @private
 */
Promise.prototype._resolveQueue = function (method, param) {
  var me = this;
  var entry;
  while (entry = this._queue.shift()) {
    if (entry[method]) {
      try {
        var res = entry[method](param);
        if (res && typeof res.then === 'function'  && typeof res['catch'] === 'function' ) {
          // a promise returned by the onSuccess or onFail function
          res.then(function (result) {
            me.resolve(result);
          }, function (error) {
            me.reject(error);
          });

          // TODO: the following should work but it doesn't
          //res.then(me.resolve.bind(me), me.reject.bind(me));

          break;
        }
      }
      catch (error) {
        this.reject(error);
        break;
      }
    }
  }

  return this;
};

/**
 * Create a promise which resolves when all provided promises are resolved,
 * and fails when any of the promises resolves.
 * @param {Promise[]} promises
 * @returns {Promise} promise
 */
Promise.all = function (promises){
  var promise = new Promise(),
      remaining = promises.length,
      results = [];

  if (remaining){
    promises.forEach(function (p, i) {
      p.then(function (result) {
        results[i] = result;
        remaining--;
        if (remaining == 0) {
          promise.resolve(results);
        }
      }, function (error) {
        remaining = 0;
        promise.reject(error);
      });
    });
  }
  else {
    promise.resolve(results);
  }

  return promise;
};

module.exports = Promise;

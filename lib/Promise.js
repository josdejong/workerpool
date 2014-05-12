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
Promise.prototype.always = function (fn){
  return this.then(fn, fn);
};

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

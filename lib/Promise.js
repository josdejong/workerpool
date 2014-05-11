'use strict';

/**
 * Promise
 *
 * Based on Deferred
 * https://gist.github.com/RubaXa/8501359
 * @author RubaXa <trash@rubaxa.org>
 * @license MIT
 */
function Promise() {
  if (!(this instanceof Promise)) {
    throw new SyntaxError('Constructor must be called with the new operator');
  }

  var me = this,
      _args,
      _doneFn = [],
      _failFn = [];

  this.done = function (fn){
    _doneFn.push(fn);
    return me;
  };

  this['catch'] = function (fn){
    _failFn.push(fn);
    return me;
  };

  this.then = function (doneFn, failFn){
    var promise = new Promise();

    me.done(_then(promise, 'resolve', doneFn));
    me['catch'](_then(promise, 'reject', failFn));

    return promise;
  };

  this.always = function (fn){
    return me.done(fn)['catch'](fn);
  };

  this.resolve = _setState(true);
  this.reject = _setState(false);

  function _setState(state){
    return function (){
      _args = arguments;

      me.done = me['catch'] = me.resolve = me.reject = function (){
        return me;
      };

      me[state ? 'done' : 'catch'] = function (fn){
        if( typeof fn === 'function' ){
          fn.apply(me, _args);
        }
        return me;
      };

      var fn,
          fns = state ? _doneFn : _failFn,
          i = 0,
          n = fns.length;

      for( ; i < n; i++ ){
        fn = fns[i];
        if( typeof fn === 'function' ){
          fn.apply(me, _args);
        }
      }

      _doneFn = _failFn = null;

      return me;
    }
  }
}

/**
 * @param {Array} args
 * @returns {Promise} promise
 */
Promise.all = function (args){
  var promise = new Promise(),
      d,
      i = args.length,
      remain = i || 1,
      _doneFn = function (){
        if( --remain === 0 ){
          promise.resolve();
        }
      };

  if( i === 0 ){
    _doneFn();
  }
  else {
    while( i-- ){
      d = args[i];
      if( d && d.then ){
        d.then(_doneFn, promise.reject);
      }
    }
  }

  return promise;
};

function _then(promise, method, callback){
  return function (){
    var args = arguments;

    if( typeof callback === 'function' ){
      var retVal = callback.apply(promise, args);
      if( retVal && typeof retVal.then === 'function' ){
        retVal.done(promise.resolve)['catch'](promise.reject);
        return;
      }
    }

    promise[method].apply(promise, args);
  };
}

module.exports = Promise;

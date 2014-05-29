/**
 * workerpool.js
 * https://github.com/josdejong/workerpool
 *
 * Offload tasks to a pool of workers on node.js and in the browser.
 *
 * @version 1.0.0
 * @date    2014-05-29
 *
 * @license
 * Copyright (C) 2014 Jos de Jong <wjosdejong@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("os"), require("child_process"));
	else if(typeof define === 'function' && define.amd)
		define(["os", "child_process"], factory);
	else if(typeof exports === 'object')
		exports["workerpool"] = factory(require("os"), require("child_process"));
	else
		root["workerpool"] = factory(root["os"], root["child_process"]);
})(this, function(__WEBPACK_EXTERNAL_MODULE_6__, __WEBPACK_EXTERNAL_MODULE_8__) {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/ 		
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/ 		
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 		
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 		
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/ 	
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/ 	
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/ 	
/******/ 	
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	var isBrowser = (typeof window !== 'undefined');

	/**
	 * Create a new worker pool
	 * @param {Object} [options]
	 * @returns {Pool} pool
	 */
	exports.pool = function pool(options) {
	  var Pool = __webpack_require__(1);

	  return new Pool(options);
	};

	/**
	 * Create a worker and optionally register a set of methods to the worker.
	 * @param {Object} [methods]
	 */
	exports.worker = function worker(methods) {
	  var environment = __webpack_require__(2);
	  if (environment == 'browser') {
	    // worker is already loaded by requiring worker

	    // use embedded worker.js
	    var blob = new Blob([__webpack_require__(3)], {type: 'text/javascript'});
	    var url = window.URL.createObjectURL(blob);
	    importScripts(url);
	  }
	  else {
	    // node
	    // TODO: do not include worker in browserified library
	    var worker = __webpack_require__(4);
	  }

	  worker.add(methods);
	};

	/**
	 * Create a promise.
	 * @type {Promise} promise
	 */
	exports.Promise = __webpack_require__(5);


/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	var Promise = __webpack_require__(5),
	    WorkerHandler = __webpack_require__(7);

	/**
	 * A pool to manage workers
	 * @param {String} [script]   Optional worker script
	 * @param {Object} [options]  Available options: maxWorkers: Number
	 * @constructor
	 */
	function Pool(script, options) {
	  if (typeof script === 'string') {
	    this.script = script || null;
	  }
	  else {
	    this.script = null;
	    options = script;
	  }

	  // configuration
	  if (options && 'maxWorkers' in options) {
	    if (!isNumber(options.maxWorkers) || !isInteger(options.maxWorkers) || options.maxWorkers < 1) {
	      throw new TypeError('Option maxWorkers must be a positive integer number');
	    }
	    this.maxWorkers = options.maxWorkers;
	  }
	  else {
	    var environment = __webpack_require__(2);
	    var numCPUs = (environment == 'browser') ? 4 : __webpack_require__(6).cpus().length;
	    this.maxWorkers = Math.max(numCPUs - 1, 1);
	  }

	  this.workers = [];  // queue with all workers
	  this.tasks = [];    // queue with tasks awaiting execution
	}

	/**
	 * Execute a function on a worker.
	 *
	 * Example usage:
	 *
	 *   var pool = new Pool()
	 *
	 *   // call a function available on the worker
	 *   pool.exec('fibonacci', [6])
	 *
	 *   // offload a function
	 *   function add(a, b) {
	 *     return a + b
	 *   };
	 *   pool.exec(add, [2, 4])
	 *       .then(function (result) {
	 *         console.log(result); // outputs 6
	 *       })
	 *       .catch(function(error) {
	 *         console.log(error);
	 *       });
	 *
	 * @param {String | Function} method  Function name or function.
	 *                                    If `method` is a string, the corresponding
	 *                                    method on the worker will be executed
	 *                                    If `method` is a Function, the function
	 *                                    will be stringified and executed via the
	 *                                    workers built-in function `run(fn, args)`.
	 * @param {Array} [params]  Function arguments applied when calling the function
	 * @return {Promise.<*, Error>} result
	 */
	Pool.prototype.exec = function (method, params) {
	  // validate type of arguments
	  if (params && !Array.isArray(params)) {
	    throw new TypeError('Array expected as argument "params"');
	  }

	  if (typeof method === 'string') {
	    var resolver = Promise.defer();

	    // add a new task to the queue
	    this.tasks.push({
	      method:  method,
	      params:  params,
	      resolver: resolver
	    });

	    // trigger task execution
	    this._next();

	    return resolver.promise;
	  }
	  else if (typeof method === 'function') {
	    // send stringified function and function arguments to worker
	    return this.exec('run', [String(method), params]);
	  }
	  else {
	    throw new TypeError('Function or string expected as argument "method"');
	  }
	};

	/**
	 * Create a proxy for current worker. Returns an object containing all
	 * methods available on the worker. The methods always return a promise.
	 *
	 * @return {Promise.<Object, Error>} proxy
	 */
	Pool.prototype.proxy = function () {
	  var pool = this;
	  return this.exec('methods')
	      .then(function (methods) {
	        var proxy = {};

	        methods.forEach(function (method) {
	          proxy[method] = function () {
	            return pool.exec(method, Array.prototype.slice.call(arguments));
	          }
	        });

	        return proxy;
	      });
	};

	/**
	 * Grab the first task from the queue, find a free worker, and assign the
	 * worker to the task.
	 * @private
	 */
	Pool.prototype._next = function () {
	  if (this.tasks.length > 0) {
	    // there are tasks in the queue

	    // find an available worker
	    var worker = this._getWorker();
	    if (worker) {
	      // get the first task from the queue
	      var me = this;
	      var task = this.tasks.shift();

	      // check if the task is still pending (and not cancelled -> promise rejected)
	      if (task.resolver.promise.pending) {
	        // send the request to the worker
	        worker.exec(task.method, task.params, task.resolver)
	            .then(function () {
	              me._next(); // trigger next task in the queue
	            })
	            .catch(function () {
	              // if the worker crashed and terminated, remove it from the pool
	              if (worker.terminated) {
	                me._removeWorker(worker);
	              }

	              me._next(); // trigger next task in the queue
	            });
	      }
	    }
	  }
	};

	/**
	 * Get an available worker. If no worker is available and the maximum number
	 * of workers isn't yet reached, a new worker will be created and returned.
	 * If no worker is available and the maximum number of workers is reached,
	 * null will be returned.
	 *
	 * @return {WorkerHandler | null} worker
	 * @private
	 */
	Pool.prototype._getWorker = function() {
	  // find a non-busy worker
	  for (var i = 0, ii = this.workers.length; i < ii; i++) {
	    var worker = this.workers[i];
	    if (!worker.busy()) {
	      return worker;
	    }
	  }

	  if (this.workers.length < this.maxWorkers) {
	    // create a new worker
	    worker = new WorkerHandler(this.script);
	    this.workers.push(worker);
	    return worker;
	  }

	  return null;
	};

	/**
	 * Remove a worker from the pool. For example after a worker terminated for
	 * whatever reason
	 * @param {WorkerHandler} worker
	 * @private
	 */
	Pool.prototype._removeWorker = function(worker) {
	  // terminate the worker (if not already terminated)
	  worker.terminate();

	  // remove from the list with workers
	  var index = this.workers.indexOf(worker);
	  if (index != -1) this.workers.splice(index, 1);
	};

	/**
	 * Close all active workers. Tasks currently being executed will be finished first.
	 * @param {boolean} [force=false]   If false (default), the workers are terminated
	 *                                  after finishing all tasks currently in
	 *                                  progress. If true, the workers will be
	 *                                  terminated immediately.
	 */
	// TODO: rename clear to terminate
	Pool.prototype.clear = function (force) {
	  this.workers.forEach(function (worker) {
	    // TODO: implement callbacks when a worker is actually terminated, only then clear the worker from our array
	    //       else we get zombie child processes :)
	    worker.terminate(force);
	  });

	  this.workers = [];
	};

	/**
	 * Test whether a variable is a number
	 * @param {*} value
	 * @returns {boolean} returns true when value is a number
	 */
	function isNumber(value) {
	  return typeof value === 'number';
	}

	/**
	 * Test whether a number is an integer
	 * @param {number} value
	 * @returns {boolean} Returns true if value is an integer
	 */
	function isInteger(value) {
	  return Math.round(value) == value;
	}

	module.exports = Pool;


/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	// determines the JavaScript environment: browser or node
	module.exports = (typeof window !== 'undefined') ? 'browser' : 'node';


/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * embeddedWorker.js contains an embedded version of worker.js.
	 * This file is automatically generated,
	 * changes made in this file will be overwritten.
	 */
	module.exports = "function isPromise(e){return e&&\"function\"==typeof e.then&&\"function\"==typeof e.catch}var worker={};if(\"undefined\"!=typeof self&&\"function\"==typeof postMessage&&\"function\"==typeof addEventListener)worker.on=function(e,r){addEventListener(e,function(e){r(e.data)})},worker.send=function(e){postMessage(e)};else{if(\"undefined\"==typeof process)throw new Error(\"Script must be executed as a worker\");worker.on=process.on.bind(process),worker.send=process.send.bind(process)}worker.methods={},worker.methods.run=function run(fn,args){var f=eval(\"(\"+fn+\")\");return f.apply(f,args)},worker.methods.methods=function(){return Object.keys(worker.methods)},worker.on(\"message\",function(e){try{var r=worker.methods[e.method];if(!r)throw new Error('Unknown method \"'+e.method+'\"');var o=r.apply(r,e.params);isPromise(o)?o.then(function(r){worker.send({id:e.id,result:r,error:null})}).catch(function(r){worker.send({id:e.id,result:null,error:r.toString()})}):worker.send({id:e.id,result:o,error:null})}catch(n){worker.send({id:e.id,result:null,error:n.toString()})}}),worker.register=function(e){if(e)for(var r in e)e.hasOwnProperty(r)&&(worker.methods[r]=e[r])},\"undefined\"!=typeof exports&&(exports.add=worker.register);";


/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * worker must be started as a child process or a web worker.
	 * It listens for RPC messages from the parent process.
	 */

	// create a worker API for sending and receiving messages which works both on
	// node.js and in the browser
	var worker = {};
	if (typeof self !== 'undefined' && typeof postMessage === 'function' && typeof addEventListener === 'function') {
	  // worker in the browser
	  worker.on = function (event, callback) {
	    addEventListener(event, function (message) {
	      callback(message.data);
	    })
	  };
	  worker.send = function (message) {
	    postMessage(message);
	  };
	}
	else if (typeof process !== 'undefined') {
	  // node.js
	  worker.on = process.on.bind(process);
	  worker.send = process.send.bind(process);
	}
	else {
	  throw new Error('Script must be executed as a worker');
	}

	/**
	 * Test whether a value is a Promise via duck typing.
	 * @param {*} value
	 * @returns {boolean} Returns true when given value is an object
	 *                    having functions `then` and `catch`.
	 */
	function isPromise(value) {
	  return value && (typeof value.then === 'function') && (typeof value.catch === 'function');
	}

	// functions available externally
	worker.methods = {};

	/**
	 * Execute a function with provided arguments
	 * @param {String} fn     Stringified function
	 * @param {Array} [args]  Function arguments
	 * @returns {*}
	 */
	worker.methods.run = function run(fn, args) {
	  var f = eval('(' + fn + ')');
	  return f.apply(f, args);
	};

	/**
	 * Get a list with methods available on this worker
	 * @return {String[]} methods
	 */
	worker.methods.methods = function methods() {
	  return Object.keys(worker.methods);
	};

	worker.on('message', function (request) {
	  try {
	    var method = worker.methods[request.method];

	    if (method) {
	      // execute the function
	      var result = method.apply(method, request.params);

	      if (isPromise(result)) {
	        // promise returned, resolve this and then return
	        result
	            .then(function (result) {
	              worker.send({
	                id: request.id,
	                result: result,
	                error: null
	              });
	            })
	            .catch(function (err) {
	              worker.send({
	                id: request.id,
	                result: null,
	                error: err.toString() // TODO: now to create a serializable error?
	              });
	            });
	      }
	      else {
	        // immediate result
	        worker.send({
	          id: request.id,
	          result: result,
	          error: null
	        });
	      }
	    }
	    else {
	      throw new Error('Unknown method "' + request.method + '"');
	    }
	  }
	  catch (err) {
	    worker.send({
	      id: request.id,
	      result: null,
	      error: err.toString() // TODO: now to create a serializable error?
	    });
	  }
	});

	/**
	 * Register methods to the worker
	 * @param {Object} methods
	 */
	worker.register = function (methods) {
	  if (methods) {
	    for (var name in methods) {
	      if (methods.hasOwnProperty(name)) {
	        worker.methods[name] = methods[name];
	      }
	    }
	  }
	};

	if (true) {
	  exports.add = worker.register;
	}


/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

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

	  // status
	  this.resolved = false;
	  this.rejected = false;
	  this.pending = true;

	  /**
	   * Process onSuccess and onFail callbacks: add them to the queue.
	   * Once the promise is resolve, the function _promise is replace.
	   * @param {Function} onSuccess
	   * @param {Function} onFail
	   * @private
	   */
	  var _process = function (onSuccess, onFail) {
	    _onSuccess.push(onSuccess);
	    _onFail.push(onFail);
	  };

	  /**
	   * Add an onSuccess callback and optionally an onFail callback to the Promise
	   * @param {Function} onSuccess
	   * @param {Function} [onFail]
	   * @returns {Promise} promise
	   */
	  this.then = function (onSuccess, onFail) {
	    return new Promise(function (resolve, reject) {
	      var s = onSuccess ? _then(onSuccess, resolve, reject) : resolve;
	      var f = onFail    ? _then(onFail,    resolve, reject) : reject;

	      _process(s, f);
	    }, me);
	  };

	  /**
	   * Resolve the promise
	   * @param {*} result
	   * @type {Function}
	   */
	  var _resolve = function (result) {
	    // update status
	    me.resolved = true;
	    me.rejected = false;
	    me.pending = false;

	    _onSuccess.forEach(function (fn) {
	      fn(result);
	    });

	    _process = function (onSuccess, onFail) {
	      onSuccess(result);
	    };

	    _resolve = _reject = function () {
	      throw new Error('Promise is already resolved');
	    };

	    return me;
	  };

	  /**
	   * Reject the promise
	   * @param {Error} error
	   * @type {Function}
	   */
	  var _reject = function (error) {
	    // update status
	    me.resolved = false;
	    me.rejected = true;
	    me.pending = false;

	    _onFail.forEach(function (fn) {
	      fn(error);
	    });

	    _process = function (onSuccess, onFail) {
	      onFail(error);
	    };

	    _resolve = _reject = function () {
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
	      _reject(new CancellationError());
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
	        _reject(new TimeoutError('Promise timed out after ' + delay + ' ms'));
	      }, delay);

	      me.always(function () {
	        clearTimeout(timer);
	      });
	    }

	    return me;
	  };

	  // attach handler passing the resolve and reject functions
	  handler(function (result) {
	    _resolve(result);
	  }, function (error) {
	    _reject(error);
	  });
	}

	/**
	 * Execute given callback, then call resolve/reject based on the returned result
	 * @param {Function} callback
	 * @param {Function} resolve
	 * @param {Function} reject
	 * @returns {Function}
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
	Promise.prototype['catch'] = function (onFail) {
	  return this.then(null, onFail);
	};

	// TODO: add support for Promise.catch(Error, callback)
	// TODO: add support for Promise.catch(Error, Error, callback)

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


/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = require("os");

/***/ },
/* 7 */
/***/ function(module, exports, __webpack_require__) {

	var Promise = __webpack_require__(5);

	// determine environment
	var environment = __webpack_require__(2);

	// get the default worker script
	function getDefaultWorker() {
	  if (environment == 'browser') {
	    // test whether the browser supports all features that we need
	    if (typeof Blob === 'undefined') {
	      throw new Error('Blob not supported by the browser');
	    }
	    if (!window.URL || typeof window.URL.createObjectURL !== 'function') {
	      throw new Error('URL.createObjectURL not supported by the browser');
	    }

	    // use embedded worker.js
	    var blob = new Blob([__webpack_require__(3)], {type: 'text/javascript'});
	    return window.URL.createObjectURL(blob);
	  }
	  else {
	    // use exteral worker.js in current directory
	    return __dirname + '/worker.js';
	  }
	}

	/**
	 * A WorkerHandler controls a single worker. This worker can be a child process
	 * on node.js or a WebWorker in a browser environment.
	 * @param {String} [script] If no script is provided, a default worker with a
	 *                          function run will be created.
	 * @constructor
	 */
	function WorkerHandler(script) {
	  this.script = script || getDefaultWorker();

	  if (environment == 'browser') {
	    // check whether Worker is supported by the browser
	    if (typeof Worker !== 'function') {
	      throw new Error('Web workers not supported by the browser');
	    }

	    // create the web worker
	    this.worker = new Worker(this.script);

	    // add node.js API to the web worker
	    this.worker.on = function (event, callback) {
	      this.addEventListener(event, function (message) {
	        callback(message.data);
	      });
	    };
	    this.worker.send = function (message) {
	      this.postMessage(message);
	    };
	  }
	  else {
	    // on node.js, create a child process
	    this.worker = __webpack_require__(8).fork(this.script);
	  }

	  var me = this;
	  this.worker.on('message', function (response) {
	    // find the task from the processing queue, and run the tasks callback
	    var id = response.id;
	    var task = me.processing[id];
	    if (task) {
	      // remove the task from the queue
	      delete me.processing[id];

	      // test if we need to terminate
	      if (me.terminating) {
	        // complete worker termination if all tasks are finished
	        me.terminate();
	      }

	      // resolve the task's promise
	      if (response.error) {
	        task.resolver.reject(response.error);
	      }
	      else {
	        task.resolver.resolve(response.result);
	      }
	    }
	  });

	  // reject all running tasks on worker error
	  function onError(error) {
	    me.terminated = true;

	    for (var id in me.processing) {
	      if (me.processing.hasOwnProperty(id)) {
	        me.processing[id].resolver.reject(error);
	      }
	    }
	    me.processing = {};
	  }

	  // listen for worker messages error and exit
	  this.worker.on('error', onError);
	  this.worker.on('exit', function () {
	    var error = new Error('Worker terminated unexpectedly');
	    onError(error);
	  });

	  this.processing = {}; // queue with tasks currently in progress

	  this.terminating = false;
	  this.terminated = false;
	  this.lastId = 0;
	}

	/**
	 * Get a list with methods available on the worker.
	 * @return {Promise.<String[], Error>} methods
	 */
	WorkerHandler.prototype.methods = function () {
	  return this.exec('methods');
	};

	/**
	 * Execute a method with given parameters on the worker
	 * @param {String} method
	 * @param {Array} [params]
	 * @param {{resolve: Function, reject: Function}} [resolver]
	 * @return {Promise.<*, Error>} result
	 */
	WorkerHandler.prototype.exec = function(method, params, resolver) {
	  if (!resolver) {
	    resolver = Promise.defer();
	  }

	  // generate a unique id for the task
	  var id = ++this.lastId;

	  // register a new task as being in progress
	  this.processing[id] = {
	    id: id,
	    resolver: resolver
	  };

	  // build a JSON-RPC request
	  var request = {
	    id: id,
	    method: method,
	    params: params
	  };

	  if (this.terminated) {
	    resolver.reject(new Error('Worker is terminated'));
	  }
	  else {
	    // send the request to the worker
	    this.worker.send(request);
	  }

	  // on cancellation, force the worker to terminate
	  var me = this;
	  resolver.promise
	    //.catch(Promise.CancellationError, function(error) { // TODO: not yet supported
	      .catch(function (error) {
	        if (error instanceof Promise.CancellationError || error instanceof Promise.TimeoutError) {
	          // remove this task from the queue. It is already rejected (hence this
	          // catch event), and else it will be rejected again when terminating
	          delete me.processing[id];

	          // terminate worker
	          me.terminate(true);
	        }
	      });

	  return resolver.promise;
	};

	/**
	 * Test whether the worker is working or not
	 * @return {boolean} Returns true if the worker is busy
	 */
	WorkerHandler.prototype.busy = function () {
	  return Object.keys(this.processing).length > 0;
	};

	/**
	 * Terminate the worker.
	 * @param {boolean} [force=false]   If false (default), the worker is terminated
	 *                                  after finishing all tasks currently in
	 *                                  progress. If true, the worker will be
	 *                                  terminated immediately.
	 */
	WorkerHandler.prototype.terminate = function (force) {
	  if (force) {
	    // cancel all tasks in progress
	    for (var id in this.processing) {
	      if (this.processing.hasOwnProperty(id)) {
	        this.processing[id].resolver.reject(new Error('Worker terminated'));
	      }
	    }
	    this.processing = {};
	  }

	  if (!this.busy()) {
	    // all tasks are finished. kill the worker
	    if (this.worker) {
	      if (typeof this.worker.kill === 'function') {
	        this.worker.kill();  // child process
	      }
	      else if (typeof this.worker.terminate === 'function') {
	        this.worker.terminate(); // web worker
	      }
	      else {
	        throw new Error('Failed to terminate worker');
	      }
	      this.worker = null;
	    }
	    this.terminating = false;
	    this.terminated = true;
	  }
	  else {
	    // we can't terminate immediately, there are still tasks being executed
	    this.terminating = true;
	  }
	};

	module.exports = WorkerHandler;


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = require("child_process");

/***/ }
/******/ ])
})

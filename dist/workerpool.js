/**
 * workerpool.js
 * https://github.com/josdejong/workerpool
 *
 * Offload tasks to a pool of workers on node.js and in the browser.
 *
 * @version 0.0.1
 * @date    2014-05-07
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
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define(factory);
	else if(typeof exports === 'object')
		exports["workerpool"] = factory();
	else
		root["workerpool"] = factory();
})(this, function() {
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


/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	var Promise = __webpack_require__(8),
	    WorkerHandler = __webpack_require__(5);

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
	 * Offload execution of a function to a worker.
	 *
	 * Example usage:
	 *
	 *   function add(a, b) {
	 *     return a + b
	 *   };
	 *   var pool = new Pool()
	 *   pool.run(add, [2, 4])
	 *       .then(function (result) {
	 *         console.log(result); // outputs 6
	 *       })
	 *       .catch(function(error) {
	 *         console.log(error);
	 *       });
	 *
	 * @param {Function} fn    The function to be executed. The function must be
	 *                         serializable and must not depend on external
	 *                         variables.
	 * @param {Array} [args]   Arguments applied when calling the function
	 * @return {Promise.<*, Error>} result
	 */
	Pool.prototype.run = function (fn, args) {
	  // validate type of arguments
	  if (typeof fn !== 'function') {
	    throw new TypeError('Function expected as argument "fn"');
	  }
	  if (args && !Array.isArray(args)) {
	    throw new TypeError('Array expected as argument "args"');
	  }

	  // send stringified function and function arguments to worker
	  return this.exec('run', [String(fn), args]);
	};

	/**
	 * Execute a function on a worker
	 *
	 * @param {String} method   Function name. The function must be present on
	 *                          the worker
	 * @param {Array} [params]  Function arguments applied when calling the function
	 * @return {Promise.<*, Error>} result
	 */
	Pool.prototype.exec = function (method, params) {
	  var me = this;
	  return new Promise(function (resolve, reject) {
	    // add a new task to the queue
	    me.tasks.push({
	      method:  method,
	      params:  params,
	      resolve: resolve,
	      reject:  reject
	    });

	    // trigger task execution
	    me._next();
	  });
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

	      // send the request to the worker
	      worker.exec(task.method, task.params)
	          .then(function (result) {
	            task.resolve(result);
	            me._next(); // trigger next task in the queue
	          })
	          .catch(function (error) {
	            task.reject(error);

	            // if the worker crashed and terminated, remove it from the pool
	            if (worker.terminated) {
	              me._removeWorker(worker);
	            }

	            me._next(); // trigger next task in the queue
	          });
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

	/* WEBPACK VAR INJECTION */(function(process) {/**
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
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(7)))

/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(__dirname) {var Promise = __webpack_require__(8),
	    child_process = __webpack_require__(9);

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
	    this.worker = child_process.fork(this.script);
	  }

	  var me = this;
	  this.worker.on('message', function (response) {
	    // find the task from the processing queue, and run the tasks callback
	    var id = response.id;
	    var task = me.processing[id];
	    if (task) {
	      // remove the task from the queue
	      delete me.processing[id];

	      // resolve the task's promise
	      try {
	        if (response.error) {
	          task.reject(response.error);
	        }
	        else {
	          task.resolve(response.result);
	        }
	      }
	      catch (err) {}

	      // test if we need to terminate
	      if (me.terminating) {
	        // complete worker termination if all tasks are finished
	        me.terminate();
	      }
	    }
	  });

	  // reject all running tasks on worker error
	  function onError(error) {
	    me.terminated = true;

	    for (var id in me.processing) {
	      if (me.processing.hasOwnProperty(id)) {
	        me.processing[id].reject(error);
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
	 * @return {Promise.<*, Error>} result
	 */
	WorkerHandler.prototype.exec = function(method, params) {
	  var me = this;

	  return new Promise(function (resolve, reject) {
	    // generate a unique id for the task
	    var id = ++me.lastId;

	    // register a new task as being in progress
	    me.processing[id] = {
	      id: id,
	      resolve: resolve,
	      reject: reject
	    };

	    // build a JSON-RPC request
	    var request = {
	      id: id,
	      method: method,
	      params: params
	    };

	    // send the request to the worker
	    me.worker.send(request);
	  });
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
	        this.processing[id].reject(new Error('Worker terminated'));
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
	
	/* WEBPACK VAR INJECTION */}.call(exports, "/"))

/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	exports.endianness = function () { return 'LE' };

	exports.hostname = function () {
	    if (typeof location !== 'undefined') {
	        return location.hostname
	    }
	    else return '';
	};

	exports.loadavg = function () { return [] };

	exports.uptime = function () { return 0 };

	exports.freemem = function () {
	    return Number.MAX_VALUE;
	};

	exports.totalmem = function () {
	    return Number.MAX_VALUE;
	};

	exports.cpus = function () { return [] };

	exports.type = function () { return 'Browser' };

	exports.release = function () {
	    if (typeof navigator !== 'undefined') {
	        return navigator.appVersion;
	    }
	    return '';
	};

	exports.networkInterfaces
	= exports.getNetworkInterfaces
	= function () { return {} };

	exports.arch = function () { return 'javascript' };

	exports.platform = function () { return 'browser' };

	exports.tmpdir = exports.tmpDir = function () {
	    return '/tmp';
	};

	exports.EOL = '\n';


/***/ },
/* 7 */
/***/ function(module, exports, __webpack_require__) {

	// shim for using process in browser

	var process = module.exports = {};

	process.nextTick = (function () {
	    var canSetImmediate = typeof window !== 'undefined'
	    && window.setImmediate;
	    var canPost = typeof window !== 'undefined'
	    && window.postMessage && window.addEventListener
	    ;

	    if (canSetImmediate) {
	        return function (f) { return window.setImmediate(f) };
	    }

	    if (canPost) {
	        var queue = [];
	        window.addEventListener('message', function (ev) {
	            var source = ev.source;
	            if ((source === window || source === null) && ev.data === 'process-tick') {
	                ev.stopPropagation();
	                if (queue.length > 0) {
	                    var fn = queue.shift();
	                    fn();
	                }
	            }
	        }, true);

	        return function nextTick(fn) {
	            queue.push(fn);
	            window.postMessage('process-tick', '*');
	        };
	    }

	    return function nextTick(fn) {
	        setTimeout(fn, 0);
	    };
	})();

	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];

	function noop() {}

	process.on = noop;
	process.once = noop;
	process.off = noop;
	process.emit = noop;

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	}

	// TODO(shtylman)
	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var Promise = __webpack_require__(10)();
	module.exports = Promise;

/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {



/***/ },
/* 10 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function() {
	var global = __webpack_require__(11);
	var util = __webpack_require__(12);
	var async = __webpack_require__(13);
	var errors = __webpack_require__(14);

	var INTERNAL = function(){};
	var APPLY = {};
	var NEXT_FILTER = {e: null};

	var PromiseArray = __webpack_require__(15)(Promise, INTERNAL);
	var CapturedTrace = __webpack_require__(16)();
	var CatchFilter = __webpack_require__(17)(NEXT_FILTER);
	var PromiseResolver = __webpack_require__(18);

	var isArray = util.isArray;

	var errorObj = util.errorObj;
	var tryCatch1 = util.tryCatch1;
	var tryCatch2 = util.tryCatch2;
	var tryCatchApply = util.tryCatchApply;
	var RangeError = errors.RangeError;
	var TypeError = errors.TypeError;
	var CancellationError = errors.CancellationError;
	var TimeoutError = errors.TimeoutError;
	var RejectionError = errors.RejectionError;
	var originatesFromRejection = errors.originatesFromRejection;
	var markAsOriginatingFromRejection = errors.markAsOriginatingFromRejection;
	var canAttach = errors.canAttach;
	var thrower = util.thrower;
	var apiRejection = __webpack_require__(19)(Promise);


	var makeSelfResolutionError = function Promise$_makeSelfResolutionError() {
	    return new TypeError("circular promise resolution chain");
	};

	function isPromise(obj) {
	    if (obj === void 0) return false;
	    return obj instanceof Promise;
	}

	function isPromiseArrayProxy(receiver, promiseSlotValue) {
	    if (receiver instanceof PromiseArray) {
	        return promiseSlotValue >= 0;
	    }
	    return false;
	}

	function Promise(resolver) {
	    if (typeof resolver !== "function") {
	        throw new TypeError("the promise constructor requires a resolver function");
	    }
	    if (this.constructor !== Promise) {
	        throw new TypeError("the promise constructor cannot be invoked directly");
	    }
	    this._bitField = 0;
	    this._fulfillmentHandler0 = void 0;
	    this._rejectionHandler0 = void 0;
	    this._promise0 = void 0;
	    this._receiver0 = void 0;
	    this._settledValue = void 0;
	    this._boundTo = void 0;
	    if (resolver !== INTERNAL) this._resolveFromResolver(resolver);
	}

	Promise.prototype.bind = function Promise$bind(thisArg) {
	    var ret = new Promise(INTERNAL);
	    ret._setTrace(this);
	    ret._follow(this);
	    ret._setBoundTo(thisArg);
	    if (this._cancellable()) {
	        ret._setCancellable();
	        ret._cancellationParent = this;
	    }
	    return ret;
	};

	Promise.prototype.toString = function Promise$toString() {
	    return "[object Promise]";
	};

	Promise.prototype.caught = Promise.prototype["catch"] =
	function Promise$catch(fn) {
	    var len = arguments.length;
	    if (len > 1) {
	        var catchInstances = new Array(len - 1),
	            j = 0, i;
	        for (i = 0; i < len - 1; ++i) {
	            var item = arguments[i];
	            if (typeof item === "function") {
	                catchInstances[j++] = item;
	            }
	            else {
	                var catchFilterTypeError =
	                    new TypeError(
	                        "A catch filter must be an error constructor "
	                        + "or a filter function");

	                this._attachExtraTrace(catchFilterTypeError);
	                async.invoke(this._reject, this, catchFilterTypeError);
	                return;
	            }
	        }
	        catchInstances.length = j;
	        fn = arguments[i];

	        this._resetTrace();
	        var catchFilter = new CatchFilter(catchInstances, fn, this);
	        return this._then(void 0, catchFilter.doFilter, void 0,
	            catchFilter, void 0);
	    }
	    return this._then(void 0, fn, void 0, void 0, void 0);
	};

	Promise.prototype.then =
	function Promise$then(didFulfill, didReject, didProgress) {
	    return this._then(didFulfill, didReject, didProgress,
	        void 0, void 0);
	};


	Promise.prototype.done =
	function Promise$done(didFulfill, didReject, didProgress) {
	    var promise = this._then(didFulfill, didReject, didProgress,
	        void 0, void 0);
	    promise._setIsFinal();
	};

	Promise.prototype.spread = function Promise$spread(didFulfill, didReject) {
	    return this._then(didFulfill, didReject, void 0,
	        APPLY, void 0);
	};

	Promise.prototype.isCancellable = function Promise$isCancellable() {
	    return !this.isResolved() &&
	        this._cancellable();
	};

	Promise.prototype.toJSON = function Promise$toJSON() {
	    var ret = {
	        isFulfilled: false,
	        isRejected: false,
	        fulfillmentValue: void 0,
	        rejectionReason: void 0
	    };
	    if (this.isFulfilled()) {
	        ret.fulfillmentValue = this._settledValue;
	        ret.isFulfilled = true;
	    }
	    else if (this.isRejected()) {
	        ret.rejectionReason = this._settledValue;
	        ret.isRejected = true;
	    }
	    return ret;
	};

	Promise.prototype.all = function Promise$all() {
	    return Promise$_all(this, true);
	};


	Promise.is = isPromise;

	function Promise$_all(promises, useBound) {
	    return Promise$_CreatePromiseArray(
	        promises,
	        PromiseArray,
	        useBound === true && promises._isBound()
	            ? promises._boundTo
	            : void 0
	   ).promise();
	}
	Promise.all = function Promise$All(promises) {
	    return Promise$_all(promises, false);
	};

	Promise.join = function Promise$Join() {
	    var $_len = arguments.length;var args = new Array($_len); for(var $_i = 0; $_i < $_len; ++$_i) {args[$_i] = arguments[$_i];}
	    return Promise$_CreatePromiseArray(args, PromiseArray, void 0).promise();
	};

	Promise.resolve = Promise.fulfilled =
	function Promise$Resolve(value) {
	    var ret = new Promise(INTERNAL);
	    ret._setTrace(void 0);
	    if (ret._tryFollow(value)) {
	        return ret;
	    }
	    ret._cleanValues();
	    ret._setFulfilled();
	    ret._settledValue = value;
	    return ret;
	};

	Promise.reject = Promise.rejected = function Promise$Reject(reason) {
	    var ret = new Promise(INTERNAL);
	    ret._setTrace(void 0);
	    markAsOriginatingFromRejection(reason);
	    ret._cleanValues();
	    ret._setRejected();
	    ret._settledValue = reason;
	    if (!canAttach(reason)) {
	        var trace = new Error(reason + "");
	        ret._setCarriedStackTrace(trace);
	    }
	    ret._ensurePossibleRejectionHandled();
	    return ret;
	};

	Promise.prototype.error = function Promise$_error(fn) {
	    return this.caught(originatesFromRejection, fn);
	};

	Promise.prototype._resolveFromSyncValue =
	function Promise$_resolveFromSyncValue(value) {
	    if (value === errorObj) {
	        this._cleanValues();
	        this._setRejected();
	        this._settledValue = value.e;
	        this._ensurePossibleRejectionHandled();
	    }
	    else {
	        var maybePromise = Promise._cast(value, void 0);
	        if (maybePromise instanceof Promise) {
	            this._follow(maybePromise);
	        }
	        else {
	            this._cleanValues();
	            this._setFulfilled();
	            this._settledValue = value;
	        }
	    }
	};

	Promise.method = function Promise$_Method(fn) {
	    if (typeof fn !== "function") {
	        throw new TypeError("fn must be a function");
	    }
	    return function Promise$_method() {
	        var value;
	        switch(arguments.length) {
	        case 0: value = tryCatch1(fn, this, void 0); break;
	        case 1: value = tryCatch1(fn, this, arguments[0]); break;
	        case 2: value = tryCatch2(fn, this, arguments[0], arguments[1]); break;
	        default:
	            var $_len = arguments.length;var args = new Array($_len); for(var $_i = 0; $_i < $_len; ++$_i) {args[$_i] = arguments[$_i];}
	            value = tryCatchApply(fn, args, this); break;
	        }
	        var ret = new Promise(INTERNAL);
	        ret._setTrace(void 0);
	        ret._resolveFromSyncValue(value);
	        return ret;
	    };
	};

	Promise.attempt = Promise["try"] = function Promise$_Try(fn, args, ctx) {
	    if (typeof fn !== "function") {
	        return apiRejection("fn must be a function");
	    }
	    var value = isArray(args)
	        ? tryCatchApply(fn, args, ctx)
	        : tryCatch1(fn, ctx, args);

	    var ret = new Promise(INTERNAL);
	    ret._setTrace(void 0);
	    ret._resolveFromSyncValue(value);
	    return ret;
	};

	Promise.defer = Promise.pending = function Promise$Defer() {
	    var promise = new Promise(INTERNAL);
	    promise._setTrace(void 0);
	    return new PromiseResolver(promise);
	};

	Promise.bind = function Promise$Bind(thisArg) {
	    var ret = new Promise(INTERNAL);
	    ret._setTrace(void 0);
	    ret._setFulfilled();
	    ret._setBoundTo(thisArg);
	    return ret;
	};

	Promise.cast = function Promise$_Cast(obj) {
	    var ret = Promise._cast(obj, void 0);
	    if (!(ret instanceof Promise)) {
	        return Promise.resolve(ret);
	    }
	    return ret;
	};

	Promise.onPossiblyUnhandledRejection =
	function Promise$OnPossiblyUnhandledRejection(fn) {
	        CapturedTrace.possiblyUnhandledRejection = typeof fn === "function"
	                                                    ? fn : void 0;
	};

	var unhandledRejectionHandled;
	Promise.onUnhandledRejectionHandled =
	function Promise$onUnhandledRejectionHandled(fn) {
	    unhandledRejectionHandled = typeof fn === "function" ? fn : void 0;
	};

	var debugging = false || !!(
	    typeof process !== "undefined" &&
	    typeof process.execPath === "string" &&
	    typeof process.env === "object" &&
	    (process.env["BLUEBIRD_DEBUG"] ||
	        process.env["NODE_ENV"] === "development")
	);


	Promise.longStackTraces = function Promise$LongStackTraces() {
	    if (async.haveItemsQueued() &&
	        debugging === false
	   ) {
	        throw new Error("cannot enable long stack traces after promises have been created");
	    }
	    debugging = CapturedTrace.isSupported();
	};

	Promise.hasLongStackTraces = function Promise$HasLongStackTraces() {
	    return debugging && CapturedTrace.isSupported();
	};

	Promise.prototype._setProxyHandlers =
	function Promise$_setProxyHandlers(receiver, promiseSlotValue) {
	    var index = this._length();

	    if (index >= 524287 - 5) {
	        index = 0;
	        this._setLength(0);
	    }
	    if (index === 0) {
	        this._promise0 = promiseSlotValue;
	        this._receiver0 = receiver;
	    }
	    else {
	        var i = index - 5;
	        this[i + 3] = promiseSlotValue;
	        this[i + 4] = receiver;
	        this[i + 0] =
	        this[i + 1] =
	        this[i + 2] = void 0;
	    }
	    this._setLength(index + 5);
	};

	Promise.prototype._proxyPromiseArray =
	function Promise$_proxyPromiseArray(promiseArray, index) {
	    this._setProxyHandlers(promiseArray, index);
	};

	Promise.prototype._proxyPromise = function Promise$_proxyPromise(promise) {
	    promise._setProxied();
	    this._setProxyHandlers(promise, -1);
	};

	Promise.prototype._then =
	function Promise$_then(
	    didFulfill,
	    didReject,
	    didProgress,
	    receiver,
	    internalData
	) {
	    var haveInternalData = internalData !== void 0;
	    var ret = haveInternalData ? internalData : new Promise(INTERNAL);

	    if (debugging && !haveInternalData) {
	        var haveSameContext = this._peekContext() === this._traceParent;
	        ret._traceParent = haveSameContext ? this._traceParent : this;
	        ret._setTrace(this);
	    }

	    if (!haveInternalData && this._isBound()) {
	        ret._setBoundTo(this._boundTo);
	    }

	    var callbackIndex =
	        this._addCallbacks(didFulfill, didReject, didProgress, ret, receiver);

	    if (!haveInternalData && this._cancellable()) {
	        ret._setCancellable();
	        ret._cancellationParent = this;
	    }

	    if (this.isResolved()) {
	        async.invoke(this._queueSettleAt, this, callbackIndex);
	    }

	    return ret;
	};

	Promise.prototype._length = function Promise$_length() {
	    return this._bitField & 524287;
	};

	Promise.prototype._isFollowingOrFulfilledOrRejected =
	function Promise$_isFollowingOrFulfilledOrRejected() {
	    return (this._bitField & 939524096) > 0;
	};

	Promise.prototype._isFollowing = function Promise$_isFollowing() {
	    return (this._bitField & 536870912) === 536870912;
	};

	Promise.prototype._setLength = function Promise$_setLength(len) {
	    this._bitField = (this._bitField & -524288) |
	        (len & 524287);
	};

	Promise.prototype._setFulfilled = function Promise$_setFulfilled() {
	    this._bitField = this._bitField | 268435456;
	};

	Promise.prototype._setRejected = function Promise$_setRejected() {
	    this._bitField = this._bitField | 134217728;
	};

	Promise.prototype._setFollowing = function Promise$_setFollowing() {
	    this._bitField = this._bitField | 536870912;
	};

	Promise.prototype._setIsFinal = function Promise$_setIsFinal() {
	    this._bitField = this._bitField | 33554432;
	};

	Promise.prototype._isFinal = function Promise$_isFinal() {
	    return (this._bitField & 33554432) > 0;
	};

	Promise.prototype._cancellable = function Promise$_cancellable() {
	    return (this._bitField & 67108864) > 0;
	};

	Promise.prototype._setCancellable = function Promise$_setCancellable() {
	    this._bitField = this._bitField | 67108864;
	};

	Promise.prototype._unsetCancellable = function Promise$_unsetCancellable() {
	    this._bitField = this._bitField & (~67108864);
	};

	Promise.prototype._setRejectionIsUnhandled =
	function Promise$_setRejectionIsUnhandled() {
	    this._bitField = this._bitField | 2097152;
	};

	Promise.prototype._unsetRejectionIsUnhandled =
	function Promise$_unsetRejectionIsUnhandled() {
	    this._bitField = this._bitField & (~2097152);
	    if (this._isUnhandledRejectionNotified()) {
	        this._unsetUnhandledRejectionIsNotified();
	        this._notifyUnhandledRejectionIsHandled();
	    }
	};

	Promise.prototype._isRejectionUnhandled =
	function Promise$_isRejectionUnhandled() {
	    return (this._bitField & 2097152) > 0;
	};

	Promise.prototype._setUnhandledRejectionIsNotified =
	function Promise$_setUnhandledRejectionIsNotified() {
	    this._bitField = this._bitField | 524288;
	};

	Promise.prototype._unsetUnhandledRejectionIsNotified =
	function Promise$_unsetUnhandledRejectionIsNotified() {
	    this._bitField = this._bitField & (~524288);
	};

	Promise.prototype._isUnhandledRejectionNotified =
	function Promise$_isUnhandledRejectionNotified() {
	    return (this._bitField & 524288) > 0;
	};

	Promise.prototype._setCarriedStackTrace =
	function Promise$_setCarriedStackTrace(capturedTrace) {
	    this._bitField = this._bitField | 1048576;
	    this._fulfillmentHandler0 = capturedTrace;
	};

	Promise.prototype._unsetCarriedStackTrace =
	function Promise$_unsetCarriedStackTrace() {
	    this._bitField = this._bitField & (~1048576);
	    this._fulfillmentHandler0 = void 0;
	};

	Promise.prototype._isCarryingStackTrace =
	function Promise$_isCarryingStackTrace() {
	    return (this._bitField & 1048576) > 0;
	};

	Promise.prototype._getCarriedStackTrace =
	function Promise$_getCarriedStackTrace() {
	    return this._isCarryingStackTrace()
	        ? this._fulfillmentHandler0
	        : void 0;
	};

	Promise.prototype._receiverAt = function Promise$_receiverAt(index) {
	    var ret;
	    if (index === 0) {
	        ret = this._receiver0;
	    }
	    else {
	        ret = this[index + 4 - 5];
	    }
	    if (this._isBound() && ret === void 0) {
	        return this._boundTo;
	    }
	    return ret;
	};

	Promise.prototype._promiseAt = function Promise$_promiseAt(index) {
	    if (index === 0) return this._promise0;
	    return this[index + 3 - 5];
	};

	Promise.prototype._fulfillmentHandlerAt =
	function Promise$_fulfillmentHandlerAt(index) {
	    if (index === 0) return this._fulfillmentHandler0;
	    return this[index + 0 - 5];
	};

	Promise.prototype._rejectionHandlerAt =
	function Promise$_rejectionHandlerAt(index) {
	    if (index === 0) return this._rejectionHandler0;
	    return this[index + 1 - 5];
	};

	Promise.prototype._unsetAt = function Promise$_unsetAt(index) {
	     if (index === 0) {
	        this._rejectionHandler0 =
	        this._progressHandler0 =
	        this._promise0 =
	        this._receiver0 = void 0;
	        if (!this._isCarryingStackTrace()) {
	            this._fulfillmentHandler0 = void 0;
	        }
	    }
	    else {
	        this[index - 5 + 0] =
	        this[index - 5 + 1] =
	        this[index - 5 + 2] =
	        this[index - 5 + 3] =
	        this[index - 5 + 4] = void 0;
	    }
	};

	Promise.prototype._resolveFromResolver =
	function Promise$_resolveFromResolver(resolver) {
	    var promise = this;
	    this._setTrace(void 0);
	    this._pushContext();

	    function Promise$_resolver(val) {
	        if (promise._tryFollow(val)) {
	            return;
	        }
	        promise._fulfill(val);
	    }
	    function Promise$_rejecter(val) {
	        var trace = canAttach(val) ? val : new Error(val + "");
	        promise._attachExtraTrace(trace);
	        markAsOriginatingFromRejection(val);
	        promise._reject(val, trace === val ? void 0 : trace);
	    }
	    var r = tryCatch2(resolver, void 0, Promise$_resolver, Promise$_rejecter);
	    this._popContext();

	    if (r !== void 0 && r === errorObj) {
	        var e = r.e;
	        var trace = canAttach(e) ? e : new Error(e + "");
	        promise._reject(e, trace);
	    }
	};

	Promise.prototype._addCallbacks = function Promise$_addCallbacks(
	    fulfill,
	    reject,
	    progress,
	    promise,
	    receiver
	) {
	    var index = this._length();

	    if (index >= 524287 - 5) {
	        index = 0;
	        this._setLength(0);
	    }

	    if (index === 0) {
	        this._promise0 = promise;
	        if (receiver !== void 0) this._receiver0 = receiver;
	        if (typeof fulfill === "function" && !this._isCarryingStackTrace())
	            this._fulfillmentHandler0 = fulfill;
	        if (typeof reject === "function") this._rejectionHandler0 = reject;
	        if (typeof progress === "function") this._progressHandler0 = progress;
	    }
	    else {
	        var i = index - 5;
	        this[i + 3] = promise;
	        this[i + 4] = receiver;
	        this[i + 0] = typeof fulfill === "function"
	                                            ? fulfill : void 0;
	        this[i + 1] = typeof reject === "function"
	                                            ? reject : void 0;
	        this[i + 2] = typeof progress === "function"
	                                            ? progress : void 0;
	    }
	    this._setLength(index + 5);
	    return index;
	};



	Promise.prototype._setBoundTo = function Promise$_setBoundTo(obj) {
	    if (obj !== void 0) {
	        this._bitField = this._bitField | 8388608;
	        this._boundTo = obj;
	    }
	    else {
	        this._bitField = this._bitField & (~8388608);
	    }
	};

	Promise.prototype._isBound = function Promise$_isBound() {
	    return (this._bitField & 8388608) === 8388608;
	};

	Promise.prototype._spreadSlowCase =
	function Promise$_spreadSlowCase(targetFn, promise, values, boundTo) {
	    var promiseForAll =
	            Promise$_CreatePromiseArray
	                (values, PromiseArray, boundTo)
	            .promise()
	            ._then(function() {
	                return targetFn.apply(boundTo, arguments);
	            }, void 0, void 0, APPLY, void 0);

	    promise._follow(promiseForAll);
	};

	Promise.prototype._callSpread =
	function Promise$_callSpread(handler, promise, value, localDebugging) {
	    var boundTo = this._isBound() ? this._boundTo : void 0;
	    if (isArray(value)) {
	        for (var i = 0, len = value.length; i < len; ++i) {
	            if (isPromise(Promise._cast(value[i], void 0))) {
	                this._spreadSlowCase(handler, promise, value, boundTo);
	                return;
	            }
	        }
	    }
	    if (localDebugging) promise._pushContext();
	    return tryCatchApply(handler, value, boundTo);
	};

	Promise.prototype._callHandler =
	function Promise$_callHandler(
	    handler, receiver, promise, value, localDebugging) {
	    var x;
	    if (receiver === APPLY && !this.isRejected()) {
	        x = this._callSpread(handler, promise, value, localDebugging);
	    }
	    else {
	        if (localDebugging) promise._pushContext();
	        x = tryCatch1(handler, receiver, value);
	    }
	    if (localDebugging) promise._popContext();
	    return x;
	};

	Promise.prototype._settlePromiseFromHandler =
	function Promise$_settlePromiseFromHandler(
	    handler, receiver, value, promise
	) {
	    if (!isPromise(promise)) {
	        handler.call(receiver, value, promise);
	        return;
	    }

	    var localDebugging = debugging;
	    var x = this._callHandler(handler, receiver,
	                                promise, value, localDebugging);

	    if (promise._isFollowing()) return;

	    if (x === errorObj || x === promise || x === NEXT_FILTER) {
	        var err = x === promise
	                    ? makeSelfResolutionError()
	                    : x.e;
	        var trace = canAttach(err) ? err : new Error(err + "");
	        if (x !== NEXT_FILTER) promise._attachExtraTrace(trace);
	        promise._rejectUnchecked(err, trace);
	    }
	    else {
	        var castValue = Promise._cast(x, promise);
	        if (isPromise(castValue)) {
	            if (castValue.isRejected() &&
	                !castValue._isCarryingStackTrace() &&
	                !canAttach(castValue._settledValue)) {
	                var trace = new Error(castValue._settledValue + "");
	                promise._attachExtraTrace(trace);
	                castValue._setCarriedStackTrace(trace);
	            }
	            promise._follow(castValue);
	            if (castValue._cancellable()) {
	                promise._cancellationParent = castValue;
	                promise._setCancellable();
	            }
	        }
	        else {
	            promise._fulfillUnchecked(x);
	        }
	    }
	};

	Promise.prototype._follow =
	function Promise$_follow(promise) {
	    this._setFollowing();

	    if (promise.isPending()) {
	        if (promise._cancellable() ) {
	            this._cancellationParent = promise;
	            this._setCancellable();
	        }
	        promise._proxyPromise(this);
	    }
	    else if (promise.isFulfilled()) {
	        this._fulfillUnchecked(promise._settledValue);
	    }
	    else {
	        this._rejectUnchecked(promise._settledValue,
	            promise._getCarriedStackTrace());
	    }

	    if (promise._isRejectionUnhandled()) promise._unsetRejectionIsUnhandled();

	    if (debugging &&
	        promise._traceParent == null) {
	        promise._traceParent = this;
	    }
	};

	Promise.prototype._tryFollow =
	function Promise$_tryFollow(value) {
	    if (this._isFollowingOrFulfilledOrRejected() ||
	        value === this) {
	        return false;
	    }
	    var maybePromise = Promise._cast(value, void 0);
	    if (!isPromise(maybePromise)) {
	        return false;
	    }
	    this._follow(maybePromise);
	    return true;
	};

	Promise.prototype._resetTrace = function Promise$_resetTrace() {
	    if (debugging) {
	        this._trace = new CapturedTrace(this._peekContext() === void 0);
	    }
	};

	Promise.prototype._setTrace = function Promise$_setTrace(parent) {
	    if (debugging) {
	        var context = this._peekContext();
	        this._traceParent = context;
	        var isTopLevel = context === void 0;
	        if (parent !== void 0 &&
	            parent._traceParent === context) {
	            this._trace = parent._trace;
	        }
	        else {
	            this._trace = new CapturedTrace(isTopLevel);
	        }
	    }
	    return this;
	};

	Promise.prototype._attachExtraTrace =
	function Promise$_attachExtraTrace(error) {
	    if (debugging) {
	        var promise = this;
	        var stack = error.stack;
	        stack = typeof stack === "string"
	            ? stack.split("\n") : [];
	        var headerLineCount = 1;

	        while(promise != null &&
	            promise._trace != null) {
	            stack = CapturedTrace.combine(
	                stack,
	                promise._trace.stack.split("\n")
	           );
	            promise = promise._traceParent;
	        }

	        var max = Error.stackTraceLimit + headerLineCount;
	        var len = stack.length;
	        if (len  > max) {
	            stack.length = max;
	        }
	        if (stack.length <= headerLineCount) {
	            error.stack = "(No stack trace)";
	        }
	        else {
	            error.stack = stack.join("\n");
	        }
	    }
	};

	Promise.prototype._cleanValues = function Promise$_cleanValues() {
	    if (this._cancellable()) {
	        this._cancellationParent = void 0;
	    }
	};

	Promise.prototype._fulfill = function Promise$_fulfill(value) {
	    if (this._isFollowingOrFulfilledOrRejected()) return;
	    this._fulfillUnchecked(value);
	};

	Promise.prototype._reject =
	function Promise$_reject(reason, carriedStackTrace) {
	    if (this._isFollowingOrFulfilledOrRejected()) return;
	    this._rejectUnchecked(reason, carriedStackTrace);
	};

	Promise.prototype._settlePromiseAt = function Promise$_settlePromiseAt(index) {
	    var handler = this.isFulfilled()
	        ? this._fulfillmentHandlerAt(index)
	        : this._rejectionHandlerAt(index);

	    var value = this._settledValue;
	    var receiver = this._receiverAt(index);
	    var promise = this._promiseAt(index);

	    if (typeof handler === "function") {
	        this._settlePromiseFromHandler(handler, receiver, value, promise);
	    }
	    else {
	        var done = false;
	        var isFulfilled = this.isFulfilled();
	        if (receiver !== void 0) {
	            if (receiver instanceof Promise &&
	                receiver._isProxied()) {
	                receiver._unsetProxied();

	                if (isFulfilled) receiver._fulfillUnchecked(value);
	                else receiver._rejectUnchecked(value,
	                    this._getCarriedStackTrace());
	                done = true;
	            }
	            else if (isPromiseArrayProxy(receiver, promise)) {
	                if (isFulfilled) receiver._promiseFulfilled(value, promise);
	                else receiver._promiseRejected(value, promise);
	                done = true;
	            }
	        }

	        if (!done) {
	            if (isFulfilled) promise._fulfill(value);
	            else promise._reject(value, this._getCarriedStackTrace());
	        }
	    }

	    if (index >= 256) {
	        this._queueGC();
	    }
	};

	Promise.prototype._isProxied = function Promise$_isProxied() {
	    return (this._bitField & 4194304) === 4194304;
	};

	Promise.prototype._setProxied = function Promise$_setProxied() {
	    this._bitField = this._bitField | 4194304;
	};

	Promise.prototype._unsetProxied = function Promise$_unsetProxied() {
	    this._bitField = this._bitField & (~4194304);
	};

	Promise.prototype._isGcQueued = function Promise$_isGcQueued() {
	    return (this._bitField & -1073741824) === -1073741824;
	};

	Promise.prototype._setGcQueued = function Promise$_setGcQueued() {
	    this._bitField = this._bitField | -1073741824;
	};

	Promise.prototype._unsetGcQueued = function Promise$_unsetGcQueued() {
	    this._bitField = this._bitField & (~-1073741824);
	};

	Promise.prototype._queueGC = function Promise$_queueGC() {
	    if (this._isGcQueued()) return;
	    this._setGcQueued();
	    async.invokeLater(this._gc, this, void 0);
	};

	Promise.prototype._gc = function Promise$gc() {
	    var len = this._length();
	    this._unsetAt(0);
	    for (var i = 0; i < len; i++) {
	        delete this[i];
	    }
	    this._setLength(0);
	    this._unsetGcQueued();
	};

	Promise.prototype._queueSettleAt = function Promise$_queueSettleAt(index) {
	    if (this._isRejectionUnhandled()) this._unsetRejectionIsUnhandled();
	    async.invoke(this._settlePromiseAt, this, index);
	};

	Promise.prototype._fulfillUnchecked =
	function Promise$_fulfillUnchecked(value) {
	    if (!this.isPending()) return;
	    if (value === this) {
	        var err = makeSelfResolutionError();
	        this._attachExtraTrace(err);
	        return this._rejectUnchecked(err, void 0);
	    }
	    this._cleanValues();
	    this._setFulfilled();
	    this._settledValue = value;
	    var len = this._length();

	    if (len > 0) {
	        async.invoke(this._settlePromises, this, len);
	    }
	};

	Promise.prototype._rejectUncheckedCheckError =
	function Promise$_rejectUncheckedCheckError(reason) {
	    var trace = canAttach(reason) ? reason : new Error(reason + "");
	    this._rejectUnchecked(reason, trace === reason ? void 0 : trace);
	};

	Promise.prototype._rejectUnchecked =
	function Promise$_rejectUnchecked(reason, trace) {
	    if (!this.isPending()) return;
	    if (reason === this) {
	        var err = makeSelfResolutionError();
	        this._attachExtraTrace(err);
	        return this._rejectUnchecked(err);
	    }
	    this._cleanValues();
	    this._setRejected();
	    this._settledValue = reason;

	    if (this._isFinal()) {
	        async.invokeLater(thrower, void 0, trace === void 0 ? reason : trace);
	        return;
	    }
	    var len = this._length();

	    if (trace !== void 0) this._setCarriedStackTrace(trace);

	    if (len > 0) {
	        async.invoke(this._rejectPromises, this, null);
	    }
	    else {
	        this._ensurePossibleRejectionHandled();
	    }
	};

	Promise.prototype._rejectPromises = function Promise$_rejectPromises() {
	    this._settlePromises();
	    this._unsetCarriedStackTrace();
	};

	Promise.prototype._settlePromises = function Promise$_settlePromises() {
	    var len = this._length();
	    for (var i = 0; i < len; i+= 5) {
	        this._settlePromiseAt(i);
	    }
	};

	Promise.prototype._ensurePossibleRejectionHandled =
	function Promise$_ensurePossibleRejectionHandled() {
	    this._setRejectionIsUnhandled();
	    if (CapturedTrace.possiblyUnhandledRejection !== void 0) {
	        async.invokeLater(this._notifyUnhandledRejection, this, void 0);
	    }
	};

	Promise.prototype._notifyUnhandledRejectionIsHandled =
	function Promise$_notifyUnhandledRejectionIsHandled() {
	    if (typeof unhandledRejectionHandled === "function") {
	        async.invokeLater(unhandledRejectionHandled, void 0, this);
	    }
	};

	Promise.prototype._notifyUnhandledRejection =
	function Promise$_notifyUnhandledRejection() {
	    if (this._isRejectionUnhandled()) {
	        var reason = this._settledValue;
	        var trace = this._getCarriedStackTrace();

	        this._setUnhandledRejectionIsNotified();

	        if (trace !== void 0) {
	            this._unsetCarriedStackTrace();
	            reason = trace;
	        }
	        if (typeof CapturedTrace.possiblyUnhandledRejection === "function") {
	            CapturedTrace.possiblyUnhandledRejection(reason, this);
	        }
	    }
	};

	var contextStack = [];
	Promise.prototype._peekContext = function Promise$_peekContext() {
	    var lastIndex = contextStack.length - 1;
	    if (lastIndex >= 0) {
	        return contextStack[lastIndex];
	    }
	    return void 0;

	};

	Promise.prototype._pushContext = function Promise$_pushContext() {
	    if (!debugging) return;
	    contextStack.push(this);
	};

	Promise.prototype._popContext = function Promise$_popContext() {
	    if (!debugging) return;
	    contextStack.pop();
	};

	function Promise$_CreatePromiseArray(
	    promises, PromiseArrayConstructor, boundTo) {

	    var list = null;
	    if (isArray(promises)) {
	        list = promises;
	    }
	    else {
	        list = Promise._cast(promises, void 0);
	        if (list !== promises) {
	            list._setBoundTo(boundTo);
	        }
	        else if (!isPromise(list)) {
	            list = null;
	        }
	    }
	    if (list !== null) {
	        return new PromiseArrayConstructor(list, boundTo);
	    }
	    return {
	        promise: function() {return apiRejection("expecting an array, a promise or a thenable");}
	    };
	}

	var old = global.Promise;
	Promise.noConflict = function() {
	    if (global.Promise === Promise) {
	        global.Promise = old;
	    }
	    return Promise;
	};

	if (!CapturedTrace.isSupported()) {
	    Promise.longStackTraces = function(){};
	    debugging = false;
	}

	Promise._makeSelfResolutionError = makeSelfResolutionError;
	__webpack_require__(20)(Promise, NEXT_FILTER);
	__webpack_require__(21)(Promise);
	__webpack_require__(22)(Promise, INTERNAL);
	__webpack_require__(23)(Promise);
	Promise.RangeError = RangeError;
	Promise.CancellationError = CancellationError;
	Promise.TimeoutError = TimeoutError;
	Promise.TypeError = TypeError;
	Promise.RejectionError = RejectionError;

	util.toFastProperties(Promise);
	util.toFastProperties(Promise.prototype);
	__webpack_require__(24)(Promise,INTERNAL);
	__webpack_require__(25)(Promise,Promise$_CreatePromiseArray,PromiseArray);
	__webpack_require__(26)(Promise,INTERNAL);
	__webpack_require__(27)(Promise);
	__webpack_require__(28)(Promise,Promise$_CreatePromiseArray,PromiseArray,apiRejection);
	__webpack_require__(29)(Promise,apiRejection,INTERNAL);
	__webpack_require__(30)(Promise,PromiseArray,INTERNAL,apiRejection);
	__webpack_require__(31)(Promise);
	__webpack_require__(32)(Promise,INTERNAL);
	__webpack_require__(33)(Promise,PromiseArray);
	__webpack_require__(34)(Promise,Promise$_CreatePromiseArray,PromiseArray,apiRejection,INTERNAL);
	__webpack_require__(35)(Promise,Promise$_CreatePromiseArray,PromiseArray);
	__webpack_require__(36)(Promise,Promise$_CreatePromiseArray,PromiseArray,apiRejection);
	__webpack_require__(37)(Promise,isPromiseArrayProxy);
	__webpack_require__(38)(Promise,INTERNAL);

	Promise.prototype = Promise.prototype;
	return Promise;

	};
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(7)))

/***/ },
/* 11 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(global) {/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	module.exports = (function() {
	    if (this !== void 0) return this;
	    try {return global;}
	    catch(e) {}
	    try {return window;}
	    catch(e) {}
	    try {return self;}
	    catch(e) {}
	})();
	
	/* WEBPACK VAR INJECTION */}.call(exports, (function() { return this; }())))

/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var global = __webpack_require__(11);
	var es5 = __webpack_require__(39);
	var haveGetters = (function(){
	    try {
	        var o = {};
	        es5.defineProperty(o, "f", {
	            get: function () {
	                return 3;
	            }
	        });
	        return o.f === 3;
	    }
	    catch (e) {
	        return false;
	    }

	})();

	var canEvaluate = (function() {
	    if (typeof window !== "undefined" && window !== null &&
	        typeof window.document !== "undefined" &&
	        typeof navigator !== "undefined" && navigator !== null &&
	        typeof navigator.appName === "string" &&
	        window === global) {
	        return false;
	    }
	    return true;
	})();

	function deprecated(msg) {
	    if (typeof console !== "undefined" && console !== null &&
	        typeof console.warn === "function") {
	        console.warn("Bluebird: " + msg);
	    }
	}

	var errorObj = {e: {}};
	function tryCatch1(fn, receiver, arg) {
	    try {
	        return fn.call(receiver, arg);
	    }
	    catch (e) {
	        errorObj.e = e;
	        return errorObj;
	    }
	}

	function tryCatch2(fn, receiver, arg, arg2) {
	    try {
	        return fn.call(receiver, arg, arg2);
	    }
	    catch (e) {
	        errorObj.e = e;
	        return errorObj;
	    }
	}

	function tryCatchApply(fn, args, receiver) {
	    try {
	        return fn.apply(receiver, args);
	    }
	    catch (e) {
	        errorObj.e = e;
	        return errorObj;
	    }
	}

	var inherits = function(Child, Parent) {
	    var hasProp = {}.hasOwnProperty;

	    function T() {
	        this.constructor = Child;
	        this.constructor$ = Parent;
	        for (var propertyName in Parent.prototype) {
	            if (hasProp.call(Parent.prototype, propertyName) &&
	                propertyName.charAt(propertyName.length-1) !== "$"
	           ) {
	                this[propertyName + "$"] = Parent.prototype[propertyName];
	            }
	        }
	    }
	    T.prototype = Parent.prototype;
	    Child.prototype = new T();
	    return Child.prototype;
	};

	function asString(val) {
	    return typeof val === "string" ? val : ("" + val);
	}

	function isPrimitive(val) {
	    return val == null || val === true || val === false ||
	        typeof val === "string" || typeof val === "number";

	}

	function isObject(value) {
	    return !isPrimitive(value);
	}

	function maybeWrapAsError(maybeError) {
	    if (!isPrimitive(maybeError)) return maybeError;

	    return new Error(asString(maybeError));
	}

	function withAppended(target, appendee) {
	    var len = target.length;
	    var ret = new Array(len + 1);
	    var i;
	    for (i = 0; i < len; ++i) {
	        ret[i] = target[i];
	    }
	    ret[i] = appendee;
	    return ret;
	}


	function notEnumerableProp(obj, name, value) {
	    if (isPrimitive(obj)) return obj;
	    var descriptor = {
	        value: value,
	        configurable: true,
	        enumerable: false,
	        writable: true
	    };
	    es5.defineProperty(obj, name, descriptor);
	    return obj;
	}


	var wrapsPrimitiveReceiver = (function() {
	    return this !== "string";
	}).call("string");

	function thrower(r) {
	    throw r;
	}


	function toFastProperties(obj) {
	    /*jshint -W027*/
	    function f() {}
	    f.prototype = obj;
	    return f;
	    eval(obj);
	}

	var ret = {
	    thrower: thrower,
	    isArray: es5.isArray,
	    haveGetters: haveGetters,
	    notEnumerableProp: notEnumerableProp,
	    isPrimitive: isPrimitive,
	    isObject: isObject,
	    canEvaluate: canEvaluate,
	    deprecated: deprecated,
	    errorObj: errorObj,
	    tryCatch1: tryCatch1,
	    tryCatch2: tryCatch2,
	    tryCatchApply: tryCatchApply,
	    inherits: inherits,
	    withAppended: withAppended,
	    asString: asString,
	    maybeWrapAsError: maybeWrapAsError,
	    wrapsPrimitiveReceiver: wrapsPrimitiveReceiver,
	    toFastProperties: toFastProperties
	};

	module.exports = ret;


/***/ },
/* 13 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var schedule = __webpack_require__(40);
	var Queue = __webpack_require__(41);
	var errorObj = __webpack_require__(12).errorObj;
	var tryCatch1 = __webpack_require__(12).tryCatch1;
	var process = __webpack_require__(11).process;

	function Async() {
	    this._isTickUsed = false;
	    this._length = 0;
	    this._lateBuffer = new Queue();
	    this._functionBuffer = new Queue(25000 * 3);
	    var self = this;
	    this.consumeFunctionBuffer = function Async$consumeFunctionBuffer() {
	        self._consumeFunctionBuffer();
	    };
	}

	Async.prototype.haveItemsQueued = function Async$haveItemsQueued() {
	    return this._length > 0;
	};

	Async.prototype.invokeLater = function Async$invokeLater(fn, receiver, arg) {
	    if (process !== void 0 &&
	        process.domain != null &&
	        !fn.domain) {
	        fn = process.domain.bind(fn);
	    }
	    this._lateBuffer.push(fn, receiver, arg);
	    this._queueTick();
	};

	Async.prototype.invoke = function Async$invoke(fn, receiver, arg) {
	    if (process !== void 0 &&
	        process.domain != null &&
	        !fn.domain) {
	        fn = process.domain.bind(fn);
	    }
	    var functionBuffer = this._functionBuffer;
	    functionBuffer.push(fn, receiver, arg);
	    this._length = functionBuffer.length();
	    this._queueTick();
	};

	Async.prototype._consumeFunctionBuffer =
	function Async$_consumeFunctionBuffer() {
	    var functionBuffer = this._functionBuffer;
	    while(functionBuffer.length() > 0) {
	        var fn = functionBuffer.shift();
	        var receiver = functionBuffer.shift();
	        var arg = functionBuffer.shift();
	        fn.call(receiver, arg);
	    }
	    this._reset();
	    this._consumeLateBuffer();
	};

	Async.prototype._consumeLateBuffer = function Async$_consumeLateBuffer() {
	    var buffer = this._lateBuffer;
	    while(buffer.length() > 0) {
	        var fn = buffer.shift();
	        var receiver = buffer.shift();
	        var arg = buffer.shift();
	        var res = tryCatch1(fn, receiver, arg);
	        if (res === errorObj) {
	            this._queueTick();
	            if (fn.domain != null) {
	                fn.domain.emit("error", res.e);
	            }
	            else {
	                throw res.e;
	            }
	        }
	    }
	};

	Async.prototype._queueTick = function Async$_queue() {
	    if (!this._isTickUsed) {
	        schedule(this.consumeFunctionBuffer);
	        this._isTickUsed = true;
	    }
	};

	Async.prototype._reset = function Async$_reset() {
	    this._isTickUsed = false;
	    this._length = 0;
	};

	module.exports = new Async();


/***/ },
/* 14 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var global = __webpack_require__(11);
	var Objectfreeze = __webpack_require__(39).freeze;
	var util = __webpack_require__(12);
	var inherits = util.inherits;
	var notEnumerableProp = util.notEnumerableProp;
	var Error = global.Error;

	function markAsOriginatingFromRejection(e) {
	    try {
	        notEnumerableProp(e, "isAsync", true);
	    }
	    catch(ignore) {}
	}

	function originatesFromRejection(e) {
	    if (e == null) return false;
	    return ((e instanceof RejectionError) ||
	        e["isAsync"] === true);
	}

	function isError(obj) {
	    return obj instanceof Error;
	}

	function canAttach(obj) {
	    return isError(obj);
	}

	function subError(nameProperty, defaultMessage) {
	    function SubError(message) {
	        if (!(this instanceof SubError)) return new SubError(message);
	        this.message = typeof message === "string" ? message : defaultMessage;
	        this.name = nameProperty;
	        if (Error.captureStackTrace) {
	            Error.captureStackTrace(this, this.constructor);
	        }
	    }
	    inherits(SubError, Error);
	    return SubError;
	}

	var TypeError = global.TypeError;
	if (typeof TypeError !== "function") {
	    TypeError = subError("TypeError", "type error");
	}
	var RangeError = global.RangeError;
	if (typeof RangeError !== "function") {
	    RangeError = subError("RangeError", "range error");
	}
	var CancellationError = subError("CancellationError", "cancellation error");
	var TimeoutError = subError("TimeoutError", "timeout error");

	function RejectionError(message) {
	    this.name = "RejectionError";
	    this.message = message;
	    this.cause = message;
	    this.isAsync = true;

	    if (message instanceof Error) {
	        this.message = message.message;
	        this.stack = message.stack;
	    }
	    else if (Error.captureStackTrace) {
	        Error.captureStackTrace(this, this.constructor);
	    }

	}
	inherits(RejectionError, Error);

	var key = "__BluebirdErrorTypes__";
	var errorTypes = global[key];
	if (!errorTypes) {
	    errorTypes = Objectfreeze({
	        CancellationError: CancellationError,
	        TimeoutError: TimeoutError,
	        RejectionError: RejectionError
	    });
	    notEnumerableProp(global, key, errorTypes);
	}

	module.exports = {
	    Error: Error,
	    TypeError: TypeError,
	    RangeError: RangeError,
	    CancellationError: errorTypes.CancellationError,
	    RejectionError: errorTypes.RejectionError,
	    TimeoutError: errorTypes.TimeoutError,
	    originatesFromRejection: originatesFromRejection,
	    markAsOriginatingFromRejection: markAsOriginatingFromRejection,
	    canAttach: canAttach
	};


/***/ },
/* 15 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, INTERNAL) {
	var canAttach = __webpack_require__(14).canAttach;
	var util = __webpack_require__(12);
	var async = __webpack_require__(13);
	var hasOwn = {}.hasOwnProperty;
	var isArray = util.isArray;

	function toResolutionValue(val) {
	    switch(val) {
	    case -1: return void 0;
	    case -2: return [];
	    case -3: return {};
	    }
	}

	function PromiseArray(values, boundTo) {
	    var promise = this._promise = new Promise(INTERNAL);
	    var parent = void 0;
	    if (values instanceof Promise) {
	        parent = values;
	        if (values._cancellable()) {
	            promise._setCancellable();
	            promise._cancellationParent = values;
	        }
	        if (values._isBound()) {
	            promise._setBoundTo(boundTo);
	        }
	    }
	    promise._setTrace(parent);
	    this._values = values;
	    this._length = 0;
	    this._totalResolved = 0;
	    this._init(void 0, -2);
	}
	PromiseArray.PropertiesPromiseArray = function() {};

	PromiseArray.prototype.length = function PromiseArray$length() {
	    return this._length;
	};

	PromiseArray.prototype.promise = function PromiseArray$promise() {
	    return this._promise;
	};

	PromiseArray.prototype._init =
	function PromiseArray$_init(_, resolveValueIfEmpty) {
	    var values = this._values;
	    if (values instanceof Promise) {
	        if (values.isFulfilled()) {
	            values = values._settledValue;
	            if (!isArray(values)) {
	                var err = new Promise.TypeError("expecting an array, a promise or a thenable");
	                this.__hardReject__(err);
	                return;
	            }
	            this._values = values;
	        }
	        else if (values.isPending()) {
	            values._then(
	                this._init,
	                this._reject,
	                void 0,
	                this,
	                resolveValueIfEmpty
	           );
	            return;
	        }
	        else {
	            values._unsetRejectionIsUnhandled();
	            this._reject(values._settledValue);
	            return;
	        }
	    }

	    if (values.length === 0) {
	        this._resolve(toResolutionValue(resolveValueIfEmpty));
	        return;
	    }
	    var len = values.length;
	    var newLen = len;
	    var newValues;
	    if (this instanceof PromiseArray.PropertiesPromiseArray) {
	        newValues = this._values;
	    }
	    else {
	        newValues = new Array(len);
	    }
	    var isDirectScanNeeded = false;
	    for (var i = 0; i < len; ++i) {
	        var promise = values[i];
	        if (promise === void 0 && !hasOwn.call(values, i)) {
	            newLen--;
	            continue;
	        }
	        var maybePromise = Promise._cast(promise, void 0);
	        if (maybePromise instanceof Promise) {
	            if (maybePromise.isPending()) {
	                maybePromise._proxyPromiseArray(this, i);
	            }
	            else {
	                maybePromise._unsetRejectionIsUnhandled();
	                isDirectScanNeeded = true;
	            }
	        }
	        else {
	            isDirectScanNeeded = true;
	        }
	        newValues[i] = maybePromise;
	    }
	    if (newLen === 0) {
	        if (resolveValueIfEmpty === -2) {
	            this._resolve(newValues);
	        }
	        else {
	            this._resolve(toResolutionValue(resolveValueIfEmpty));
	        }
	        return;
	    }
	    this._values = newValues;
	    this._length = newLen;
	    if (isDirectScanNeeded) {
	        var scanMethod = newLen === len
	            ? this._scanDirectValues
	            : this._scanDirectValuesHoled;
	        async.invoke(scanMethod, this, len);
	    }
	};

	PromiseArray.prototype._settlePromiseAt =
	function PromiseArray$_settlePromiseAt(index) {
	    var value = this._values[index];
	    if (!(value instanceof Promise)) {
	        this._promiseFulfilled(value, index);
	    }
	    else if (value.isFulfilled()) {
	        this._promiseFulfilled(value._settledValue, index);
	    }
	    else if (value.isRejected()) {
	        this._promiseRejected(value._settledValue, index);
	    }
	};

	PromiseArray.prototype._scanDirectValuesHoled =
	function PromiseArray$_scanDirectValuesHoled(len) {
	    for (var i = 0; i < len; ++i) {
	        if (this._isResolved()) {
	            break;
	        }
	        if (hasOwn.call(this._values, i)) {
	            this._settlePromiseAt(i);
	        }
	    }
	};

	PromiseArray.prototype._scanDirectValues =
	function PromiseArray$_scanDirectValues(len) {
	    for (var i = 0; i < len; ++i) {
	        if (this._isResolved()) {
	            break;
	        }
	        this._settlePromiseAt(i);
	    }
	};

	PromiseArray.prototype._isResolved = function PromiseArray$_isResolved() {
	    return this._values === null;
	};

	PromiseArray.prototype._resolve = function PromiseArray$_resolve(value) {
	    this._values = null;
	    this._promise._fulfill(value);
	};

	PromiseArray.prototype.__hardReject__ =
	PromiseArray.prototype._reject = function PromiseArray$_reject(reason) {
	    this._values = null;
	    var trace = canAttach(reason) ? reason : new Error(reason + "");
	    this._promise._attachExtraTrace(trace);
	    this._promise._reject(reason, trace);
	};

	PromiseArray.prototype._promiseProgressed =
	function PromiseArray$_promiseProgressed(progressValue, index) {
	    if (this._isResolved()) return;
	    this._promise._progress({
	        index: index,
	        value: progressValue
	    });
	};


	PromiseArray.prototype._promiseFulfilled =
	function PromiseArray$_promiseFulfilled(value, index) {
	    if (this._isResolved()) return;
	    this._values[index] = value;
	    var totalResolved = ++this._totalResolved;
	    if (totalResolved >= this._length) {
	        this._resolve(this._values);
	    }
	};

	PromiseArray.prototype._promiseRejected =
	function PromiseArray$_promiseRejected(reason, index) {
	    if (this._isResolved()) return;
	    this._totalResolved++;
	    this._reject(reason);
	};

	return PromiseArray;
	};


/***/ },
/* 16 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function() {
	var inherits = __webpack_require__(12).inherits;
	var defineProperty = __webpack_require__(39).defineProperty;

	var rignore = new RegExp(
	    "\\b(?:[a-zA-Z0-9.]+\\$_\\w+|" +
	    "tryCatch(?:1|2|Apply)|new \\w*PromiseArray|" +
	    "\\w*PromiseArray\\.\\w*PromiseArray|" +
	    "setTimeout|CatchFilter\\$_\\w+|makeNodePromisified|processImmediate|" +
	    "process._tickCallback|nextTick|Async\\$\\w+)\\b"
	);

	var rtraceline = null;
	var formatStack = null;

	function formatNonError(obj) {
	    var str;
	    if (typeof obj === "function") {
	        str = "[function " +
	            (obj.name || "anonymous") +
	            "]";
	    }
	    else {
	        str = obj.toString();
	        var ruselessToString = /\[object [a-zA-Z0-9$_]+\]/;
	        if (ruselessToString.test(str)) {
	            try {
	                var newStr = JSON.stringify(obj);
	                str = newStr;
	            }
	            catch(e) {

	            }
	        }
	        if (str.length === 0) {
	            str = "(empty array)";
	        }
	    }
	    return ("(<" + snip(str) + ">, no stack trace)");
	}

	function snip(str) {
	    var maxChars = 41;
	    if (str.length < maxChars) {
	        return str;
	    }
	    return str.substr(0, maxChars - 3) + "...";
	}

	function CapturedTrace(ignoreUntil, isTopLevel) {
	    this.captureStackTrace(CapturedTrace, isTopLevel);

	}
	inherits(CapturedTrace, Error);

	CapturedTrace.prototype.captureStackTrace =
	function CapturedTrace$captureStackTrace(ignoreUntil, isTopLevel) {
	    captureStackTrace(this, ignoreUntil, isTopLevel);
	};

	CapturedTrace.possiblyUnhandledRejection =
	function CapturedTrace$PossiblyUnhandledRejection(reason) {
	    if (typeof console === "object") {
	        var message;
	        if (typeof reason === "object" || typeof reason === "function") {
	            var stack = reason.stack;
	            message = "Possibly unhandled " + formatStack(stack, reason);
	        }
	        else {
	            message = "Possibly unhandled " + String(reason);
	        }
	        if (typeof console.error === "function" ||
	            typeof console.error === "object") {
	            console.error(message);
	        }
	        else if (typeof console.log === "function" ||
	            typeof console.log === "object") {
	            console.log(message);
	        }
	    }
	};

	CapturedTrace.combine = function CapturedTrace$Combine(current, prev) {
	    var curLast = current.length - 1;
	    for (var i = prev.length - 1; i >= 0; --i) {
	        var line = prev[i];
	        if (current[curLast] === line) {
	            current.pop();
	            curLast--;
	        }
	        else {
	            break;
	        }
	    }

	    current.push("From previous event:");
	    var lines = current.concat(prev);

	    var ret = [];

	    for (var i = 0, len = lines.length; i < len; ++i) {

	        if ((rignore.test(lines[i]) ||
	            (i > 0 && !rtraceline.test(lines[i])) &&
	            lines[i] !== "From previous event:")
	       ) {
	            continue;
	        }
	        ret.push(lines[i]);
	    }
	    return ret;
	};

	CapturedTrace.isSupported = function CapturedTrace$IsSupported() {
	    return typeof captureStackTrace === "function";
	};

	var captureStackTrace = (function stackDetection() {
	    if (typeof Error.stackTraceLimit === "number" &&
	        typeof Error.captureStackTrace === "function") {
	        rtraceline = /^\s*at\s*/;
	        formatStack = function(stack, error) {
	            if (typeof stack === "string") return stack;

	            if (error.name !== void 0 &&
	                error.message !== void 0) {
	                return error.name + ". " + error.message;
	            }
	            return formatNonError(error);


	        };
	        var captureStackTrace = Error.captureStackTrace;
	        return function CapturedTrace$_captureStackTrace(
	            receiver, ignoreUntil) {
	            captureStackTrace(receiver, ignoreUntil);
	        };
	    }
	    var err = new Error();

	    if (typeof err.stack === "string" &&
	        typeof "".startsWith === "function" &&
	        (err.stack.startsWith("stackDetection@")) &&
	        stackDetection.name === "stackDetection") {

	        defineProperty(Error, "stackTraceLimit", {
	            writable: true,
	            enumerable: false,
	            configurable: false,
	            value: 25
	        });
	        rtraceline = /@/;
	        var rline = /[@\n]/;

	        formatStack = function(stack, error) {
	            if (typeof stack === "string") {
	                return (error.name + ". " + error.message + "\n" + stack);
	            }

	            if (error.name !== void 0 &&
	                error.message !== void 0) {
	                return error.name + ". " + error.message;
	            }
	            return formatNonError(error);
	        };

	        return function captureStackTrace(o) {
	            var stack = new Error().stack;
	            var split = stack.split(rline);
	            var len = split.length;
	            var ret = "";
	            for (var i = 0; i < len; i += 2) {
	                ret += split[i];
	                ret += "@";
	                ret += split[i + 1];
	                ret += "\n";
	            }
	            o.stack = ret;
	        };
	    }
	    else {
	        formatStack = function(stack, error) {
	            if (typeof stack === "string") return stack;

	            if ((typeof error === "object" ||
	                typeof error === "function") &&
	                error.name !== void 0 &&
	                error.message !== void 0) {
	                return error.name + ". " + error.message;
	            }
	            return formatNonError(error);
	        };

	        return null;
	    }
	})();

	return CapturedTrace;
	};


/***/ },
/* 17 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(NEXT_FILTER) {
	var util = __webpack_require__(12);
	var errors = __webpack_require__(14);
	var tryCatch1 = util.tryCatch1;
	var errorObj = util.errorObj;
	var keys = __webpack_require__(39).keys;
	var TypeError = errors.TypeError;

	function CatchFilter(instances, callback, promise) {
	    this._instances = instances;
	    this._callback = callback;
	    this._promise = promise;
	}

	function CatchFilter$_safePredicate(predicate, e) {
	    var safeObject = {};
	    var retfilter = tryCatch1(predicate, safeObject, e);

	    if (retfilter === errorObj) return retfilter;

	    var safeKeys = keys(safeObject);
	    if (safeKeys.length) {
	        errorObj.e = new TypeError(
	            "Catch filter must inherit from Error "
	          + "or be a simple predicate function");
	        return errorObj;
	    }
	    return retfilter;
	}

	CatchFilter.prototype.doFilter = function CatchFilter$_doFilter(e) {
	    var cb = this._callback;
	    var promise = this._promise;
	    var boundTo = promise._isBound() ? promise._boundTo : void 0;
	    for (var i = 0, len = this._instances.length; i < len; ++i) {
	        var item = this._instances[i];
	        var itemIsErrorType = item === Error ||
	            (item != null && item.prototype instanceof Error);

	        if (itemIsErrorType && e instanceof item) {
	            var ret = tryCatch1(cb, boundTo, e);
	            if (ret === errorObj) {
	                NEXT_FILTER.e = ret.e;
	                return NEXT_FILTER;
	            }
	            return ret;
	        } else if (typeof item === "function" && !itemIsErrorType) {
	            var shouldHandle = CatchFilter$_safePredicate(item, e);
	            if (shouldHandle === errorObj) {
	                var trace = errors.canAttach(errorObj.e)
	                    ? errorObj.e
	                    : new Error(errorObj.e + "");
	                this._promise._attachExtraTrace(trace);
	                e = errorObj.e;
	                break;
	            } else if (shouldHandle) {
	                var ret = tryCatch1(cb, boundTo, e);
	                if (ret === errorObj) {
	                    NEXT_FILTER.e = ret.e;
	                    return NEXT_FILTER;
	                }
	                return ret;
	            }
	        }
	    }
	    NEXT_FILTER.e = e;
	    return NEXT_FILTER;
	};

	return CatchFilter;
	};


/***/ },
/* 18 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var util = __webpack_require__(12);
	var maybeWrapAsError = util.maybeWrapAsError;
	var errors = __webpack_require__(14);
	var TimeoutError = errors.TimeoutError;
	var RejectionError = errors.RejectionError;
	var async = __webpack_require__(13);
	var haveGetters = util.haveGetters;
	var es5 = __webpack_require__(39);

	function isUntypedError(obj) {
	    return obj instanceof Error &&
	        es5.getPrototypeOf(obj) === Error.prototype;
	}

	function wrapAsRejectionError(obj) {
	    var ret;
	    if (isUntypedError(obj)) {
	        ret = new RejectionError(obj);
	    }
	    else {
	        ret = obj;
	    }
	    errors.markAsOriginatingFromRejection(ret);
	    return ret;
	}

	function nodebackForPromise(promise) {
	    function PromiseResolver$_callback(err, value) {
	        if (promise === null) return;

	        if (err) {
	            var wrapped = wrapAsRejectionError(maybeWrapAsError(err));
	            promise._attachExtraTrace(wrapped);
	            promise._reject(wrapped);
	        }
	        else {
	            if (arguments.length > 2) {
	                var $_len = arguments.length;var args = new Array($_len - 1); for(var $_i = 1; $_i < $_len; ++$_i) {args[$_i - 1] = arguments[$_i];}
	                promise._fulfill(args);
	            }
	            else {
	                promise._fulfill(value);
	            }
	        }

	        promise = null;
	    }
	    return PromiseResolver$_callback;
	}


	var PromiseResolver;
	if (!haveGetters) {
	    PromiseResolver = function PromiseResolver(promise) {
	        this.promise = promise;
	        this.asCallback = nodebackForPromise(promise);
	        this.callback = this.asCallback;
	    };
	}
	else {
	    PromiseResolver = function PromiseResolver(promise) {
	        this.promise = promise;
	    };
	}
	if (haveGetters) {
	    var prop = {
	        get: function() {
	            return nodebackForPromise(this.promise);
	        }
	    };
	    es5.defineProperty(PromiseResolver.prototype, "asCallback", prop);
	    es5.defineProperty(PromiseResolver.prototype, "callback", prop);
	}

	PromiseResolver._nodebackForPromise = nodebackForPromise;

	PromiseResolver.prototype.toString = function PromiseResolver$toString() {
	    return "[object PromiseResolver]";
	};

	PromiseResolver.prototype.resolve =
	PromiseResolver.prototype.fulfill = function PromiseResolver$resolve(value) {
	    var promise = this.promise;
	    if ((promise === void 0) || (promise._tryFollow === void 0)) {
	        throw new TypeError("Illegal invocation, resolver resolve/reject must be called within a resolver context. Consider using the promise constructor instead.");
	    }
	    if (promise._tryFollow(value)) {
	        return;
	    }
	    async.invoke(promise._fulfill, promise, value);
	};

	PromiseResolver.prototype.reject = function PromiseResolver$reject(reason) {
	    var promise = this.promise;
	    if ((promise === void 0) || (promise._attachExtraTrace === void 0)) {
	        throw new TypeError("Illegal invocation, resolver resolve/reject must be called within a resolver context. Consider using the promise constructor instead.");
	    }
	    errors.markAsOriginatingFromRejection(reason);
	    var trace = errors.canAttach(reason) ? reason : new Error(reason + "");
	    promise._attachExtraTrace(trace);
	    async.invoke(promise._reject, promise, reason);
	    if (trace !== reason) {
	        async.invoke(this._setCarriedStackTrace, this, trace);
	    }
	};

	PromiseResolver.prototype.progress =
	function PromiseResolver$progress(value) {
	    async.invoke(this.promise._progress, this.promise, value);
	};

	PromiseResolver.prototype.cancel = function PromiseResolver$cancel() {
	    async.invoke(this.promise.cancel, this.promise, void 0);
	};

	PromiseResolver.prototype.timeout = function PromiseResolver$timeout() {
	    this.reject(new TimeoutError("timeout"));
	};

	PromiseResolver.prototype.isResolved = function PromiseResolver$isResolved() {
	    return this.promise.isResolved();
	};

	PromiseResolver.prototype.toJSON = function PromiseResolver$toJSON() {
	    return this.promise.toJSON();
	};

	PromiseResolver.prototype._setCarriedStackTrace =
	function PromiseResolver$_setCarriedStackTrace(trace) {
	    if (this.promise.isRejected()) {
	        this.promise._setCarriedStackTrace(trace);
	    }
	};

	module.exports = PromiseResolver;


/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise) {
	var TypeError = __webpack_require__(14).TypeError;

	function apiRejection(msg) {
	    var error = new TypeError(msg);
	    var ret = Promise.rejected(error);
	    var parent = ret._peekContext();
	    if (parent != null) {
	        parent._attachExtraTrace(error);
	    }
	    return ret;
	}

	return apiRejection;
	};


/***/ },
/* 20 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, NEXT_FILTER) {
	var util = __webpack_require__(12);
	var wrapsPrimitiveReceiver = util.wrapsPrimitiveReceiver;
	var isPrimitive = util.isPrimitive;
	var thrower = util.thrower;


	function returnThis() {
	    return this;
	}
	function throwThis() {
	    throw this;
	}
	function return$(r) {
	    return function Promise$_returner() {
	        return r;
	    };
	}
	function throw$(r) {
	    return function Promise$_thrower() {
	        throw r;
	    };
	}
	function promisedFinally(ret, reasonOrValue, isFulfilled) {
	    var then;
	    if (wrapsPrimitiveReceiver && isPrimitive(reasonOrValue)) {
	        then = isFulfilled ? return$(reasonOrValue) : throw$(reasonOrValue);
	    }
	    else {
	        then = isFulfilled ? returnThis : throwThis;
	    }
	    return ret._then(then, thrower, void 0, reasonOrValue, void 0);
	}

	function finallyHandler(reasonOrValue) {
	    var promise = this.promise;
	    var handler = this.handler;

	    var ret = promise._isBound()
	                    ? handler.call(promise._boundTo)
	                    : handler();

	    if (ret !== void 0) {
	        var maybePromise = Promise._cast(ret, void 0);
	        if (maybePromise instanceof Promise) {
	            return promisedFinally(maybePromise, reasonOrValue,
	                                    promise.isFulfilled());
	        }
	    }

	    if (promise.isRejected()) {
	        NEXT_FILTER.e = reasonOrValue;
	        return NEXT_FILTER;
	    }
	    else {
	        return reasonOrValue;
	    }
	}

	function tapHandler(value) {
	    var promise = this.promise;
	    var handler = this.handler;

	    var ret = promise._isBound()
	                    ? handler.call(promise._boundTo, value)
	                    : handler(value);

	    if (ret !== void 0) {
	        var maybePromise = Promise._cast(ret, void 0);
	        if (maybePromise instanceof Promise) {
	            return promisedFinally(maybePromise, value, true);
	        }
	    }
	    return value;
	}

	Promise.prototype._passThroughHandler =
	function Promise$_passThroughHandler(handler, isFinally) {
	    if (typeof handler !== "function") return this.then();

	    var promiseAndHandler = {
	        promise: this,
	        handler: handler
	    };

	    return this._then(
	            isFinally ? finallyHandler : tapHandler,
	            isFinally ? finallyHandler : void 0, void 0,
	            promiseAndHandler, void 0);
	};

	Promise.prototype.lastly =
	Promise.prototype["finally"] = function Promise$finally(handler) {
	    return this._passThroughHandler(handler, true);
	};

	Promise.prototype.tap = function Promise$tap(handler) {
	    return this._passThroughHandler(handler, false);
	};
	};


/***/ },
/* 21 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var util = __webpack_require__(12);
	var isPrimitive = util.isPrimitive;
	var wrapsPrimitiveReceiver = util.wrapsPrimitiveReceiver;

	module.exports = function(Promise) {
	var returner = function Promise$_returner() {
	    return this;
	};
	var thrower = function Promise$_thrower() {
	    throw this;
	};

	var wrapper = function Promise$_wrapper(value, action) {
	    if (action === 1) {
	        return function Promise$_thrower() {
	            throw value;
	        };
	    }
	    else if (action === 2) {
	        return function Promise$_returner() {
	            return value;
	        };
	    }
	};


	Promise.prototype["return"] =
	Promise.prototype.thenReturn =
	function Promise$thenReturn(value) {
	    if (wrapsPrimitiveReceiver && isPrimitive(value)) {
	        return this._then(
	            wrapper(value, 2),
	            void 0,
	            void 0,
	            void 0,
	            void 0
	       );
	    }
	    return this._then(returner, void 0, void 0, value, void 0);
	};

	Promise.prototype["throw"] =
	Promise.prototype.thenThrow =
	function Promise$thenThrow(reason) {
	    if (wrapsPrimitiveReceiver && isPrimitive(reason)) {
	        return this._then(
	            wrapper(reason, 1),
	            void 0,
	            void 0,
	            void 0,
	            void 0
	       );
	    }
	    return this._then(thrower, void 0, void 0, reason, void 0);
	};
	};


/***/ },
/* 22 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, INTERNAL) {
	var util = __webpack_require__(12);
	var canAttach = __webpack_require__(14).canAttach;
	var errorObj = util.errorObj;
	var isObject = util.isObject;

	function getThen(obj) {
	    try {
	        return obj.then;
	    }
	    catch(e) {
	        errorObj.e = e;
	        return errorObj;
	    }
	}

	function Promise$_Cast(obj, originalPromise) {
	    if (isObject(obj)) {
	        if (obj instanceof Promise) {
	            return obj;
	        }
	        else if (isAnyBluebirdPromise(obj)) {
	            var ret = new Promise(INTERNAL);
	            ret._setTrace(void 0);
	            obj._then(
	                ret._fulfillUnchecked,
	                ret._rejectUncheckedCheckError,
	                ret._progressUnchecked,
	                ret,
	                null
	            );
	            ret._setFollowing();
	            return ret;
	        }
	        var then = getThen(obj);
	        if (then === errorObj) {
	            if (originalPromise !== void 0 && canAttach(then.e)) {
	                originalPromise._attachExtraTrace(then.e);
	            }
	            return Promise.reject(then.e);
	        }
	        else if (typeof then === "function") {
	            return Promise$_doThenable(obj, then, originalPromise);
	        }
	    }
	    return obj;
	}

	var hasProp = {}.hasOwnProperty;
	function isAnyBluebirdPromise(obj) {
	    return hasProp.call(obj, "_promise0");
	}

	function Promise$_doThenable(x, then, originalPromise) {
	    var resolver = Promise.defer();
	    var called = false;
	    try {
	        then.call(
	            x,
	            Promise$_resolveFromThenable,
	            Promise$_rejectFromThenable,
	            Promise$_progressFromThenable
	        );
	    }
	    catch(e) {
	        if (!called) {
	            called = true;
	            var trace = canAttach(e) ? e : new Error(e + "");
	            if (originalPromise !== void 0) {
	                originalPromise._attachExtraTrace(trace);
	            }
	            resolver.promise._reject(e, trace);
	        }
	    }
	    return resolver.promise;

	    function Promise$_resolveFromThenable(y) {
	        if (called) return;
	        called = true;

	        if (x === y) {
	            var e = Promise._makeSelfResolutionError();
	            if (originalPromise !== void 0) {
	                originalPromise._attachExtraTrace(e);
	            }
	            resolver.promise._reject(e, void 0);
	            return;
	        }
	        resolver.resolve(y);
	    }

	    function Promise$_rejectFromThenable(r) {
	        if (called) return;
	        called = true;
	        var trace = canAttach(r) ? r : new Error(r + "");
	        if (originalPromise !== void 0) {
	            originalPromise._attachExtraTrace(trace);
	        }
	        resolver.promise._reject(r, trace);
	    }

	    function Promise$_progressFromThenable(v) {
	        if (called) return;
	        var promise = resolver.promise;
	        if (typeof promise._progress === "function") {
	            promise._progress(v);
	        }
	    }
	}

	Promise._cast = Promise$_Cast;
	};


/***/ },
/* 23 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise) {
	function PromiseInspection(promise) {
	    if (promise !== void 0) {
	        this._bitField = promise._bitField;
	        this._settledValue = promise.isResolved()
	            ? promise._settledValue
	            : void 0;
	    }
	    else {
	        this._bitField = 0;
	        this._settledValue = void 0;
	    }
	}

	PromiseInspection.prototype.isFulfilled =
	Promise.prototype.isFulfilled = function Promise$isFulfilled() {
	    return (this._bitField & 268435456) > 0;
	};

	PromiseInspection.prototype.isRejected =
	Promise.prototype.isRejected = function Promise$isRejected() {
	    return (this._bitField & 134217728) > 0;
	};

	PromiseInspection.prototype.isPending =
	Promise.prototype.isPending = function Promise$isPending() {
	    return (this._bitField & 402653184) === 0;
	};

	PromiseInspection.prototype.value =
	Promise.prototype.value = function Promise$value() {
	    if (!this.isFulfilled()) {
	        throw new TypeError("cannot get fulfillment value of a non-fulfilled promise");
	    }
	    return this._settledValue;
	};

	PromiseInspection.prototype.error =
	Promise.prototype.reason = function Promise$reason() {
	    if (!this.isRejected()) {
	        throw new TypeError("cannot get rejection reason of a non-rejected promise");
	    }
	    return this._settledValue;
	};

	PromiseInspection.prototype.isResolved =
	Promise.prototype.isResolved = function Promise$isResolved() {
	    return (this._bitField & 402653184) > 0;
	};

	Promise.prototype.inspect = function Promise$inspect() {
	    return new PromiseInspection(this);
	};

	Promise.PromiseInspection = PromiseInspection;
	};


/***/ },
/* 24 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var global = __webpack_require__(11);
	var setTimeout = function(fn, ms) {
	    var $_len = arguments.length;var args = new Array($_len - 2); for(var $_i = 2; $_i < $_len; ++$_i) {args[$_i - 2] = arguments[$_i];}
	    global.setTimeout(function(){
	        fn.apply(void 0, args);
	    }, ms);
	};

	module.exports = function(Promise, INTERNAL) {
	var util = __webpack_require__(12);
	var errors = __webpack_require__(14);
	var apiRejection = __webpack_require__(19)(Promise);
	var TimeoutError = Promise.TimeoutError;

	var afterTimeout = function Promise$_afterTimeout(promise, message, ms) {
	    if (!promise.isPending()) return;
	    if (typeof message !== "string") {
	        message = "operation timed out after" + " " + ms + " ms"
	    }
	    var err = new TimeoutError(message);
	    errors.markAsOriginatingFromRejection(err);
	    promise._attachExtraTrace(err);
	    promise._rejectUnchecked(err);
	};

	var afterDelay = function Promise$_afterDelay(value, promise) {
	    promise._fulfill(value);
	};

	var delay = Promise.delay = function Promise$Delay(value, ms) {
	    if (ms === void 0) {
	        ms = value;
	        value = void 0;
	    }
	    ms = +ms;
	    var maybePromise = Promise._cast(value, void 0);
	    var promise = new Promise(INTERNAL);

	    if (maybePromise instanceof Promise) {
	        if (maybePromise._isBound()) {
	            promise._setBoundTo(maybePromise._boundTo);
	        }
	        if (maybePromise._cancellable()) {
	            promise._setCancellable();
	            promise._cancellationParent = maybePromise;
	        }
	        promise._setTrace(maybePromise);
	        promise._follow(maybePromise);
	        return promise.then(function(value) {
	            return Promise.delay(value, ms);
	        });
	    }
	    else {
	        promise._setTrace(void 0);
	        setTimeout(afterDelay, ms, value, promise);
	    }
	    return promise;
	};

	Promise.prototype.delay = function Promise$delay(ms) {
	    return delay(this, ms);
	};

	Promise.prototype.timeout = function Promise$timeout(ms, message) {
	    ms = +ms;

	    var ret = new Promise(INTERNAL);
	    ret._setTrace(this);

	    if (this._isBound()) ret._setBoundTo(this._boundTo);
	    if (this._cancellable()) {
	        ret._setCancellable();
	        ret._cancellationParent = this;
	    }
	    ret._follow(this);
	    setTimeout(afterTimeout, ms, ret, message, ms);
	    return ret;
	};

	};


/***/ },
/* 25 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, Promise$_CreatePromiseArray, PromiseArray) {

	var SomePromiseArray = __webpack_require__(42)(PromiseArray);
	function Promise$_Any(promises, useBound) {
	    var ret = Promise$_CreatePromiseArray(
	        promises,
	        SomePromiseArray,
	        useBound === true && promises._isBound()
	            ? promises._boundTo
	            : void 0
	   );
	    var promise = ret.promise();
	    if (promise.isRejected()) {
	        return promise;
	    }
	    ret.setHowMany(1);
	    ret.setUnwrap();
	    ret.init();
	    return promise;
	}

	Promise.any = function Promise$Any(promises) {
	    return Promise$_Any(promises, false);
	};

	Promise.prototype.any = function Promise$any() {
	    return Promise$_Any(this, true);
	};

	};


/***/ },
/* 26 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, INTERNAL) {
	var apiRejection = __webpack_require__(19)(Promise);
	var isArray = __webpack_require__(12).isArray;

	var raceLater = function Promise$_raceLater(promise) {
	    return promise.then(function(array) {
	        return Promise$_Race(array, promise);
	    });
	};

	var hasOwn = {}.hasOwnProperty;
	function Promise$_Race(promises, parent) {
	    var maybePromise = Promise._cast(promises, void 0);

	    if (maybePromise instanceof Promise) {
	        return raceLater(maybePromise);
	    }
	    else if (!isArray(promises)) {
	        return apiRejection("expecting an array, a promise or a thenable");
	    }

	    var ret = new Promise(INTERNAL);
	    ret._setTrace(parent);
	    if (parent !== void 0) {
	        if (parent._isBound()) {
	            ret._setBoundTo(parent._boundTo);
	        }
	        if (parent._cancellable()) {
	            ret._setCancellable();
	            ret._cancellationParent = parent;
	        }
	    }
	    var fulfill = ret._fulfill;
	    var reject = ret._reject;
	    for (var i = 0, len = promises.length; i < len; ++i) {
	        var val = promises[i];

	        if (val === void 0 && !(hasOwn.call(promises, i))) {
	            continue;
	        }

	        Promise.cast(val)._then(
	            fulfill,
	            reject,
	            void 0,
	            ret,
	            null
	       );
	    }
	    return ret;
	}

	Promise.race = function Promise$Race(promises) {
	    return Promise$_Race(promises, void 0);
	};

	Promise.prototype.race = function Promise$race() {
	    return Promise$_Race(this, void 0);
	};

	};


/***/ },
/* 27 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise) {
	Promise.prototype.call = function Promise$call(propertyName) {
	    var $_len = arguments.length;var args = new Array($_len - 1); for(var $_i = 1; $_i < $_len; ++$_i) {args[$_i - 1] = arguments[$_i];}

	    return this._then(function(obj) {
	            return obj[propertyName].apply(obj, args);
	        },
	        void 0,
	        void 0,
	        void 0,
	        void 0
	   );
	};

	function Promise$getter(obj) {
	    var prop = typeof this === "string"
	        ? this
	        : ("" + this);
	    return obj[prop];
	}
	Promise.prototype.get = function Promise$get(propertyName) {
	    return this._then(
	        Promise$getter,
	        void 0,
	        void 0,
	        propertyName,
	        void 0
	   );
	};
	};


/***/ },
/* 28 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise) {
	var isArray = __webpack_require__(12).isArray;

	function Promise$_filter(booleans) {
	    var values = this instanceof Promise ? this._settledValue : this;
	    var len = values.length;
	    var ret = new Array(len);
	    var j = 0;

	    for (var i = 0; i < len; ++i) {
	        if (booleans[i]) ret[j++] = values[i];

	    }
	    ret.length = j;
	    return ret;
	}

	var ref = {ref: null};
	Promise.filter = function Promise$Filter(promises, fn) {
	    return Promise.map(promises, fn, ref)
	                  ._then(Promise$_filter, void 0, void 0, ref.ref, void 0);
	};

	Promise.prototype.filter = function Promise$filter(fn) {
	    return this.map(fn, ref)
	               ._then(Promise$_filter, void 0, void 0, ref.ref, void 0);
	};
	};


/***/ },
/* 29 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, apiRejection, INTERNAL) {
	var PromiseSpawn = __webpack_require__(43)(Promise, INTERNAL);
	var errors = __webpack_require__(14);
	var TypeError = errors.TypeError;
	var deprecated = __webpack_require__(12).deprecated;

	Promise.coroutine = function Promise$Coroutine(generatorFunction) {
	    if (typeof generatorFunction !== "function") {
	        throw new TypeError("generatorFunction must be a function");
	    }
	    var PromiseSpawn$ = PromiseSpawn;
	    return function () {
	        var generator = generatorFunction.apply(this, arguments);
	        var spawn = new PromiseSpawn$(void 0, void 0);
	        spawn._generator = generator;
	        spawn._next(void 0);
	        return spawn.promise();
	    };
	};

	Promise.coroutine.addYieldHandler = PromiseSpawn.addYieldHandler;

	Promise.spawn = function Promise$Spawn(generatorFunction) {
	    deprecated("Promise.spawn is deprecated. Use Promise.coroutine instead.");
	    if (typeof generatorFunction !== "function") {
	        return apiRejection("generatorFunction must be a function");
	    }
	    var spawn = new PromiseSpawn(generatorFunction, this);
	    var ret = spawn.promise();
	    spawn._run(Promise.spawn);
	    return ret;
	};
	};


/***/ },
/* 30 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, PromiseArray, INTERNAL, apiRejection) {

	var all = Promise.all;
	var util = __webpack_require__(12);
	var canAttach = __webpack_require__(14).canAttach;
	var isArray = util.isArray;
	var _cast = Promise._cast;

	function unpack(values) {
	    return Promise$_Map(values, this[0], this[1], this[2]);
	}

	function Promise$_Map(promises, fn, useBound, ref) {
	    if (typeof fn !== "function") {
	        return apiRejection("fn must be a function");
	    }

	    var receiver = void 0;
	    if (useBound === true) {
	        if (promises._isBound()) {
	            receiver = promises._boundTo;
	        }
	    }
	    else if (useBound !== false) {
	        receiver = useBound;
	    }

	    var shouldUnwrapItems = ref !== void 0;
	    if (shouldUnwrapItems) ref.ref = promises;

	    if (promises instanceof Promise) {
	        var pack = [fn, receiver, ref];
	        return promises._then(unpack, void 0, void 0, pack, void 0);
	    }
	    else if (!isArray(promises)) {
	        return apiRejection("expecting an array, a promise or a thenable");
	    }

	    var promise = new Promise(INTERNAL);
	    if (receiver !== void 0) promise._setBoundTo(receiver);
	    promise._setTrace(void 0);

	    var mapping = new Mapping(promise,
	                                fn,
	                                promises,
	                                receiver,
	                                shouldUnwrapItems);
	    mapping.init();
	    return promise;
	}

	var pending = {};
	function Mapping(promise, callback, items, receiver, shouldUnwrapItems) {
	    this.shouldUnwrapItems = shouldUnwrapItems;
	    this.index = 0;
	    this.items = items;
	    this.callback = callback;
	    this.receiver = receiver;
	    this.promise = promise;
	    this.result = new Array(items.length);
	}
	util.inherits(Mapping, PromiseArray);

	Mapping.prototype.init = function Mapping$init() {
	    var items = this.items;
	    var len = items.length;
	    var result = this.result;
	    var isRejected = false;
	    for (var i = 0; i < len; ++i) {
	        var maybePromise = _cast(items[i], void 0);
	        if (maybePromise instanceof Promise) {
	            if (maybePromise.isPending()) {
	                result[i] = pending;
	                maybePromise._proxyPromiseArray(this, i);
	            }
	            else if (maybePromise.isFulfilled()) {
	                result[i] = maybePromise.value();
	            }
	            else {
	                maybePromise._unsetRejectionIsUnhandled();
	                if (!isRejected) {
	                    this.reject(maybePromise.reason());
	                    isRejected = true;
	                }
	            }
	        }
	        else {
	            result[i] = maybePromise;
	        }
	    }
	    if (!isRejected) this.iterate();
	};

	Mapping.prototype.isResolved = function Mapping$isResolved() {
	    return this.promise === null;
	};

	Mapping.prototype._promiseProgressed =
	function Mapping$_promiseProgressed(value) {
	    if (this.isResolved()) return;
	    this.promise._progress(value);
	};

	Mapping.prototype._promiseFulfilled =
	function Mapping$_promiseFulfilled(value, index) {
	    if (this.isResolved()) return;
	    this.result[index] = value;
	    if (this.shouldUnwrapItems) this.items[index] = value;
	    if (this.index === index) this.iterate();
	};

	Mapping.prototype._promiseRejected =
	function Mapping$_promiseRejected(reason) {
	    this.reject(reason);
	};

	Mapping.prototype.reject = function Mapping$reject(reason) {
	    if (this.isResolved()) return;
	    var trace = canAttach(reason) ? reason : new Error(reason + "");
	    this.promise._attachExtraTrace(trace);
	    this.promise._reject(reason, trace);
	};

	Mapping.prototype.iterate = function Mapping$iterate() {
	    var i = this.index;
	    var items = this.items;
	    var result = this.result;
	    var len = items.length;
	    var result = this.result;
	    var receiver = this.receiver;
	    var callback = this.callback;

	    for (; i < len; ++i) {
	        var value = result[i];
	        if (value === pending) {
	            this.index = i;
	            return;
	        }
	        try { result[i] = callback.call(receiver, value, i, len); }
	        catch (e) { return this.reject(e); }
	    }
	    this.promise._follow(all(result));
	    this.items = this.result = this.callback = this.promise = null;
	};

	Promise.prototype.map = function Promise$map(fn, ref) {
	    return Promise$_Map(this, fn, true, ref);
	};

	Promise.map = function Promise$Map(promises, fn, ref) {
	    return Promise$_Map(promises, fn, false, ref);
	};
	};


/***/ },
/* 31 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise) {
	var util = __webpack_require__(12);
	var async = __webpack_require__(13);
	var tryCatch2 = util.tryCatch2;
	var tryCatch1 = util.tryCatch1;
	var errorObj = util.errorObj;

	function thrower(r) {
	    throw r;
	}

	function Promise$_successAdapter(val, receiver) {
	    var nodeback = this;
	    var ret = val === void 0
	        ? tryCatch1(nodeback, receiver, null)
	        : tryCatch2(nodeback, receiver, null, val);
	    if (ret === errorObj) {
	        async.invokeLater(thrower, void 0, ret.e);
	    }
	}
	function Promise$_errorAdapter(reason, receiver) {
	    var nodeback = this;
	    var ret = tryCatch1(nodeback, receiver, reason);
	    if (ret === errorObj) {
	        async.invokeLater(thrower, void 0, ret.e);
	    }
	}

	Promise.prototype.nodeify = function Promise$nodeify(nodeback) {
	    if (typeof nodeback == "function") {
	        this._then(
	            Promise$_successAdapter,
	            Promise$_errorAdapter,
	            void 0,
	            nodeback,
	            this._isBound() ? this._boundTo : null
	        );
	    }
	    return this;
	};
	};


/***/ },
/* 32 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, INTERNAL) {
	var THIS = {};
	var util = __webpack_require__(12);
	var es5 = __webpack_require__(39);
	var nodebackForPromise = __webpack_require__(18)
	    ._nodebackForPromise;
	var withAppended = util.withAppended;
	var maybeWrapAsError = util.maybeWrapAsError;
	var canEvaluate = util.canEvaluate;
	var deprecated = util.deprecated;
	var TypeError = __webpack_require__(14).TypeError;


	var rasyncSuffix = new RegExp("Async" + "$");
	function isPromisified(fn) {
	    return fn.__isPromisified__ === true;
	}
	function hasPromisified(obj, key) {
	    var containsKey = ((key + "Async") in obj);
	    return containsKey ? isPromisified(obj[key + "Async"])
	                       : false;
	}
	function checkValid(ret) {
	    for (var i = 0; i < ret.length; i += 2) {
	        var key = ret[i];
	        if (rasyncSuffix.test(key)) {
	            var keyWithoutAsyncSuffix = key.replace(rasyncSuffix, "");
	            for (var j = 0; j < ret.length; j += 2) {
	                if (ret[j] === keyWithoutAsyncSuffix) {
	                    throw new TypeError("Cannot promisify an API " +
	                        "that has normal methods with Async-suffix");
	                }
	            }
	        }
	    }
	}
	var inheritedMethods = (function() {
	    if (es5.isES5) {
	        var create = Object.create;
	        var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
	        return function(cur) {
	            var ret = [];
	            var visitedKeys = create(null);
	            var original = cur;
	            while (cur !== null) {
	                var keys = es5.keys(cur);
	                for (var i = 0, len = keys.length; i < len; ++i) {
	                    var key = keys[i];
	                    if (visitedKeys[key]) continue;
	                    visitedKeys[key] = true;
	                    var desc = getOwnPropertyDescriptor(cur, key);

	                    if (desc != null &&
	                        typeof desc.value === "function" &&
	                        !isPromisified(desc.value) &&
	                        !hasPromisified(original, key)) {
	                        ret.push(key, desc.value);
	                    }
	                }
	                cur = es5.getPrototypeOf(cur);
	            }
	            checkValid(ret);
	            return ret;
	        };
	    }
	    else {
	        return function(obj) {
	            var ret = [];
	            /*jshint forin:false */
	            for (var key in obj) {
	                var fn = obj[key];
	                if (typeof fn === "function" &&
	                    !isPromisified(fn) &&
	                    !hasPromisified(obj, key)) {
	                    ret.push(key, fn);
	                }
	            }
	            checkValid(ret);
	            return ret;
	        };
	    }
	})();

	function switchCaseArgumentOrder(likelyArgumentCount) {
	    var ret = [likelyArgumentCount];
	    var min = Math.max(0, likelyArgumentCount - 1 - 5);
	    for(var i = likelyArgumentCount - 1; i >= min; --i) {
	        if (i === likelyArgumentCount) continue;
	        ret.push(i);
	    }
	    for(var i = likelyArgumentCount + 1; i <= 5; ++i) {
	        ret.push(i);
	    }
	    return ret;
	}

	function parameterDeclaration(parameterCount) {
	    var ret = new Array(parameterCount);
	    for(var i = 0; i < ret.length; ++i) {
	        ret[i] = "_arg" + i;
	    }
	    return ret.join(", ");
	}

	function parameterCount(fn) {
	    if (typeof fn.length === "number") {
	        return Math.max(Math.min(fn.length, 1023 + 1), 0);
	    }
	    return 0;
	}

	var rident = /^[a-z$_][a-z$_0-9]*$/i;
	function propertyAccess(id) {
	    if (rident.test(id)) {
	        return "." + id;
	    }
	    else return "['" + id.replace(/(['\\])/g, "\\$1") + "']";
	}

	function makeNodePromisifiedEval(callback, receiver, originalName, fn) {
	    var newParameterCount = Math.max(0, parameterCount(fn) - 1);
	    var argumentOrder = switchCaseArgumentOrder(newParameterCount);

	    var callbackName = (typeof originalName === "string" ?
	        originalName + "Async" :
	        "promisified");

	    function generateCallForArgumentCount(count) {
	        var args = new Array(count);
	        for (var i = 0, len = args.length; i < len; ++i) {
	            args[i] = "arguments[" + i + "]";
	        }
	        var comma = count > 0 ? "," : "";

	        if (typeof callback === "string" &&
	            receiver === THIS) {
	            return "this" + propertyAccess(callback) + "("+args.join(",") +
	                comma +" fn);"+
	                "break;";
	        }
	        return (receiver === void 0
	            ? "callback("+args.join(",")+ comma +" fn);"
	            : "callback.call("+(receiver === THIS
	                ? "this"
	                : "receiver")+", "+args.join(",") + comma + " fn);") +
	        "break;";
	    }

	    if (!rident.test(callbackName)) {
	        callbackName = "promisified";
	    }

	    function generateArgumentSwitchCase() {
	        var ret = "";
	        for(var i = 0; i < argumentOrder.length; ++i) {
	            ret += "case " + argumentOrder[i] +":" +
	                generateCallForArgumentCount(argumentOrder[i]);
	        }
	        ret += "default: var args = new Array(len + 1);" +
	            "var i = 0;" +
	            "for (var i = 0; i < len; ++i) { " +
	            "   args[i] = arguments[i];" +
	            "}" +
	            "args[i] = fn;" +

	            (typeof callback === "string"
	            ? "this" + propertyAccess(callback) + ".apply("
	            : "callback.apply(") +

	            (receiver === THIS ? "this" : "receiver") +
	            ", args); break;";
	        return ret;
	    }

	    return new Function("Promise", "callback", "receiver",
	            "withAppended", "maybeWrapAsError", "nodebackForPromise",
	            "INTERNAL",
	        "var ret = function " + callbackName +
	        "(" + parameterDeclaration(newParameterCount) + ") {\"use strict\";" +
	        "var len = arguments.length;" +
	        "var promise = new Promise(INTERNAL);"+
	        "promise._setTrace(void 0);" +
	        "var fn = nodebackForPromise(promise);"+
	        "try {" +
	        "switch(len) {" +
	        generateArgumentSwitchCase() +
	        "}" +
	        "}" +
	        "catch(e){ " +
	        "var wrapped = maybeWrapAsError(e);" +
	        "promise._attachExtraTrace(wrapped);" +
	        "promise._reject(wrapped);" +
	        "}" +
	        "return promise;" +
	        "" +
	        "}; ret.__isPromisified__ = true; return ret;"
	   )(Promise, callback, receiver, withAppended,
	        maybeWrapAsError, nodebackForPromise, INTERNAL);
	}

	function makeNodePromisifiedClosure(callback, receiver) {
	    function promisified() {
	        var _receiver = receiver;
	        if (receiver === THIS) _receiver = this;
	        if (typeof callback === "string") {
	            callback = _receiver[callback];
	        }
	        var promise = new Promise(INTERNAL);
	        promise._setTrace(void 0);
	        var fn = nodebackForPromise(promise);
	        try {
	            callback.apply(_receiver, withAppended(arguments, fn));
	        }
	        catch(e) {
	            var wrapped = maybeWrapAsError(e);
	            promise._attachExtraTrace(wrapped);
	            promise._reject(wrapped);
	        }
	        return promise;
	    }
	    promisified.__isPromisified__ = true;
	    return promisified;
	}

	var makeNodePromisified = canEvaluate
	    ? makeNodePromisifiedEval
	    : makeNodePromisifiedClosure;

	function _promisify(callback, receiver, isAll) {
	    if (isAll) {
	        var methods = inheritedMethods(callback);
	        for (var i = 0, len = methods.length; i < len; i+= 2) {
	            var key = methods[i];
	            var fn = methods[i+1];
	            var promisifiedKey = key + "Async";
	            callback[promisifiedKey] = makeNodePromisified(key, THIS, key, fn);
	        }
	        util.toFastProperties(callback);
	        return callback;
	    }
	    else {
	        return makeNodePromisified(callback, receiver, void 0, callback);
	    }
	}

	Promise.promisify = function Promise$Promisify(fn, receiver) {
	    if (typeof fn === "object" && fn !== null) {
	        deprecated("Promise.promisify for promisifying entire objects is deprecated. Use Promise.promisifyAll instead.");
	        return _promisify(fn, receiver, true);
	    }
	    if (typeof fn !== "function") {
	        throw new TypeError("fn must be a function");
	    }
	    if (isPromisified(fn)) {
	        return fn;
	    }
	    return _promisify(
	        fn,
	        arguments.length < 2 ? THIS : receiver,
	        false);
	};

	Promise.promisifyAll = function Promise$PromisifyAll(target) {
	    if (typeof target !== "function" && typeof target !== "object") {
	        throw new TypeError("the target of promisifyAll must be an object or a function");
	    }
	    return _promisify(target, void 0, true);
	};
	};



/***/ },
/* 33 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, PromiseArray) {
	var PropertiesPromiseArray = __webpack_require__(44)(
	    Promise, PromiseArray);
	var util = __webpack_require__(12);
	var apiRejection = __webpack_require__(19)(Promise);
	var isObject = util.isObject;

	function Promise$_Props(promises, useBound) {
	    var ret;
	    var castValue = Promise._cast(promises, void 0);

	    if (!isObject(castValue)) {
	        return apiRejection("cannot await properties of a non-object");
	    }
	    else if (castValue instanceof Promise) {
	        ret = castValue._then(Promise.props, void 0, void 0,
	                        void 0, void 0);
	    }
	    else {
	        ret = new PropertiesPromiseArray(
	            castValue,
	            useBound === true && castValue._isBound()
	                        ? castValue._boundTo
	                        : void 0
	       ).promise();
	        useBound = false;
	    }
	    if (useBound === true && castValue._isBound()) {
	        ret._setBoundTo(castValue._boundTo);
	    }
	    return ret;
	}

	Promise.prototype.props = function Promise$props() {
	    return Promise$_Props(this, true);
	};

	Promise.props = function Promise$Props(promises) {
	    return Promise$_Props(promises, false);
	};
	};


/***/ },
/* 34 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(
	    Promise, Promise$_CreatePromiseArray,
	    PromiseArray, apiRejection, INTERNAL) {

	function Reduction(callback, index, accum, items, receiver) {
	    this.promise = new Promise(INTERNAL);
	    this.index = index;
	    this.length = items.length;
	    this.items = items;
	    this.callback = callback;
	    this.receiver = receiver;
	    this.accum = accum;
	}

	Reduction.prototype.reject = function Reduction$reject(e) {
	    this.promise._reject(e);
	};

	Reduction.prototype.fulfill = function Reduction$fulfill(value, index) {
	    this.accum = value;
	    this.index = index + 1;
	    this.iterate();
	};

	Reduction.prototype.iterate = function Reduction$iterate() {
	    var i = this.index;
	    var len = this.length;
	    var items = this.items;
	    var result = this.accum;
	    var receiver = this.receiver;
	    var callback = this.callback;

	    for (; i < len; ++i) {
	        result = callback.call(receiver, result, items[i], i, len);
	        result = Promise._cast(result, void 0);

	        if (result instanceof Promise) {
	            result._then(
	                this.fulfill, this.reject, void 0, this, i);
	            return;
	        }
	    }
	    this.promise._fulfill(result);
	};

	function Promise$_reducer(fulfilleds, initialValue) {
	    var fn = this;
	    var receiver = void 0;
	    if (typeof fn !== "function")  {
	        receiver = fn.receiver;
	        fn = fn.fn;
	    }
	    var len = fulfilleds.length;
	    var accum = void 0;
	    var startIndex = 0;

	    if (initialValue !== void 0) {
	        accum = initialValue;
	        startIndex = 0;
	    }
	    else {
	        startIndex = 1;
	        if (len > 0) accum = fulfilleds[0];
	    }
	    var i = startIndex;

	    if (i >= len) {
	        return accum;
	    }

	    var reduction = new Reduction(fn, i, accum, fulfilleds, receiver);
	    reduction.iterate();
	    return reduction.promise;
	}

	function Promise$_unpackReducer(fulfilleds) {
	    var fn = this.fn;
	    var initialValue = this.initialValue;
	    return Promise$_reducer.call(fn, fulfilleds, initialValue);
	}

	function Promise$_slowReduce(
	    promises, fn, initialValue, useBound) {
	    return initialValue._then(function(initialValue) {
	        return Promise$_Reduce(
	            promises, fn, initialValue, useBound);
	    }, void 0, void 0, void 0, void 0);
	}

	function Promise$_Reduce(promises, fn, initialValue, useBound) {
	    if (typeof fn !== "function") {
	        return apiRejection("fn must be a function");
	    }

	    if (useBound === true && promises._isBound()) {
	        fn = {
	            fn: fn,
	            receiver: promises._boundTo
	        };
	    }

	    if (initialValue !== void 0) {
	        if (initialValue instanceof Promise) {
	            if (initialValue.isFulfilled()) {
	                initialValue = initialValue._settledValue;
	            }
	            else {
	                return Promise$_slowReduce(promises,
	                    fn, initialValue, useBound);
	            }
	        }

	        return Promise$_CreatePromiseArray(promises, PromiseArray,
	            useBound === true && promises._isBound()
	                ? promises._boundTo
	                : void 0)
	            .promise()
	            ._then(Promise$_unpackReducer, void 0, void 0, {
	                fn: fn,
	                initialValue: initialValue
	            }, void 0);
	    }
	    return Promise$_CreatePromiseArray(promises, PromiseArray,
	            useBound === true && promises._isBound()
	                ? promises._boundTo
	                : void 0).promise()
	        ._then(Promise$_reducer, void 0, void 0, fn, void 0);
	}


	Promise.reduce = function Promise$Reduce(promises, fn, initialValue) {
	    return Promise$_Reduce(promises, fn, initialValue, false);
	};

	Promise.prototype.reduce = function Promise$reduce(fn, initialValue) {
	    return Promise$_Reduce(this, fn, initialValue, true);
	};
	};


/***/ },
/* 35 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports =
	    function(Promise, Promise$_CreatePromiseArray, PromiseArray) {

	var SettledPromiseArray = __webpack_require__(45)(
	    Promise, PromiseArray);

	function Promise$_Settle(promises, useBound) {
	    return Promise$_CreatePromiseArray(
	        promises,
	        SettledPromiseArray,
	        useBound === true && promises._isBound()
	            ? promises._boundTo
	            : void 0
	   ).promise();
	}

	Promise.settle = function Promise$Settle(promises) {
	    return Promise$_Settle(promises, false);
	};

	Promise.prototype.settle = function Promise$settle() {
	    return Promise$_Settle(this, true);
	};
	};


/***/ },
/* 36 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports =
	function(Promise, Promise$_CreatePromiseArray, PromiseArray, apiRejection) {

	var SomePromiseArray = __webpack_require__(42)(PromiseArray);
	function Promise$_Some(promises, howMany, useBound) {
	    if ((howMany | 0) !== howMany || howMany < 0) {
	        return apiRejection("expecting a positive integer");
	    }
	    var ret = Promise$_CreatePromiseArray(
	        promises,
	        SomePromiseArray,
	        useBound === true && promises._isBound()
	            ? promises._boundTo
	            : void 0
	   );
	    var promise = ret.promise();
	    if (promise.isRejected()) {
	        return promise;
	    }
	    ret.setHowMany(howMany);
	    ret.init();
	    return promise;
	}

	Promise.some = function Promise$Some(promises, howMany) {
	    return Promise$_Some(promises, howMany, false);
	};

	Promise.prototype.some = function Promise$some(count) {
	    return Promise$_Some(this, count, true);
	};

	};


/***/ },
/* 37 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, isPromiseArrayProxy) {
	var util = __webpack_require__(12);
	var async = __webpack_require__(13);
	var errors = __webpack_require__(14);
	var tryCatch1 = util.tryCatch1;
	var errorObj = util.errorObj;

	Promise.prototype.progressed = function Promise$progressed(handler) {
	    return this._then(void 0, void 0, handler, void 0, void 0);
	};

	Promise.prototype._progress = function Promise$_progress(progressValue) {
	    if (this._isFollowingOrFulfilledOrRejected()) return;
	    this._progressUnchecked(progressValue);

	};

	Promise.prototype._progressHandlerAt =
	function Promise$_progressHandlerAt(index) {
	    if (index === 0) return this._progressHandler0;
	    return this[index + 2 - 5];
	};

	Promise.prototype._doProgressWith =
	function Promise$_doProgressWith(progression) {
	    var progressValue = progression.value;
	    var handler = progression.handler;
	    var promise = progression.promise;
	    var receiver = progression.receiver;

	    this._pushContext();
	    var ret = tryCatch1(handler, receiver, progressValue);
	    this._popContext();

	    if (ret === errorObj) {
	        if (ret.e != null &&
	            ret.e.name !== "StopProgressPropagation") {
	            var trace = errors.canAttach(ret.e)
	                ? ret.e : new Error(ret.e + "");
	            promise._attachExtraTrace(trace);
	            promise._progress(ret.e);
	        }
	    }
	    else if (ret instanceof Promise) {
	        ret._then(promise._progress, null, null, promise, void 0);
	    }
	    else {
	        promise._progress(ret);
	    }
	};


	Promise.prototype._progressUnchecked =
	function Promise$_progressUnchecked(progressValue) {
	    if (!this.isPending()) return;
	    var len = this._length();
	    var progress = this._progress;
	    for (var i = 0; i < len; i += 5) {
	        var handler = this._progressHandlerAt(i);
	        var promise = this._promiseAt(i);
	        if (!(promise instanceof Promise)) {
	            var receiver = this._receiverAt(i);
	            if (typeof handler === "function") {
	                handler.call(receiver, progressValue, promise);
	            }
	            else if (receiver instanceof Promise && receiver._isProxied()) {
	                receiver._progressUnchecked(progressValue);
	            }
	            else if (isPromiseArrayProxy(receiver, promise)) {
	                receiver._promiseProgressed(progressValue, promise);
	            }
	            continue;
	        }

	        if (typeof handler === "function") {
	            async.invoke(this._doProgressWith, this, {
	                handler: handler,
	                promise: promise,
	                receiver: this._receiverAt(i),
	                value: progressValue
	            });
	        }
	        else {
	            async.invoke(progress, promise, progressValue);
	        }
	    }
	};
	};


/***/ },
/* 38 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, INTERNAL) {
	var errors = __webpack_require__(14);
	var async = __webpack_require__(13);
	var CancellationError = errors.CancellationError;

	Promise.prototype._cancel = function Promise$_cancel() {
	    if (!this.isCancellable()) return this;
	    var parent;
	    var promiseToReject = this;
	    while ((parent = promiseToReject._cancellationParent) !== void 0 &&
	        parent.isCancellable()) {
	        promiseToReject = parent;
	    }
	    var err = new CancellationError();
	    promiseToReject._attachExtraTrace(err);
	    promiseToReject._rejectUnchecked(err);
	};

	Promise.prototype.cancel = function Promise$cancel() {
	    if (!this.isCancellable()) return this;
	    async.invokeLater(this._cancel, this, void 0);
	    return this;
	};

	Promise.prototype.cancellable = function Promise$cancellable() {
	    if (this._cancellable()) return this;
	    this._setCancellable();
	    this._cancellationParent = void 0;
	    return this;
	};

	Promise.prototype.uncancellable = function Promise$uncancellable() {
	    var ret = new Promise(INTERNAL);
	    ret._setTrace(this);
	    ret._follow(this);
	    ret._unsetCancellable();
	    if (this._isBound()) ret._setBoundTo(this._boundTo);
	    return ret;
	};

	Promise.prototype.fork =
	function Promise$fork(didFulfill, didReject, didProgress) {
	    var ret = this._then(didFulfill, didReject, didProgress,
	                         void 0, void 0);

	    ret._setCancellable();
	    ret._cancellationParent = void 0;
	    return ret;
	};
	};


/***/ },
/* 39 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	var isES5 = (function(){
	    "use strict";
	    return this === void 0;
	})();

	if (isES5) {
	    module.exports = {
	        freeze: Object.freeze,
	        defineProperty: Object.defineProperty,
	        keys: Object.keys,
	        getPrototypeOf: Object.getPrototypeOf,
	        isArray: Array.isArray,
	        isES5: isES5
	    };
	}

	else {
	    var has = {}.hasOwnProperty;
	    var str = {}.toString;
	    var proto = {}.constructor.prototype;

	    var ObjectKeys = function ObjectKeys(o) {
	        var ret = [];
	        for (var key in o) {
	            if (has.call(o, key)) {
	                ret.push(key);
	            }
	        }
	        return ret;
	    }

	    var ObjectDefineProperty = function ObjectDefineProperty(o, key, desc) {
	        o[key] = desc.value;
	        return o;
	    }

	    var ObjectFreeze = function ObjectFreeze(obj) {
	        return obj;
	    }

	    var ObjectGetPrototypeOf = function ObjectGetPrototypeOf(obj) {
	        try {
	            return Object(obj).constructor.prototype;
	        }
	        catch (e) {
	            return proto;
	        }
	    }

	    var ArrayIsArray = function ArrayIsArray(obj) {
	        try {
	            return str.call(obj) === "[object Array]";
	        }
	        catch(e) {
	            return false;
	        }
	    }

	    module.exports = {
	        isArray: ArrayIsArray,
	        keys: ObjectKeys,
	        defineProperty: ObjectDefineProperty,
	        freeze: ObjectFreeze,
	        getPrototypeOf: ObjectGetPrototypeOf,
	        isES5: isES5
	    };
	}


/***/ },
/* 40 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	var global = __webpack_require__(11);
	var schedule;
	if (typeof process !== "undefined" && process !== null &&
	    typeof process.cwd === "function" &&
	    typeof process.nextTick === "function" &&
	    typeof process.version === "string") {
	    schedule = function Promise$_Scheduler(fn) {
	        process.nextTick(fn);
	    };
	}
	else if ((typeof global.MutationObserver === "function" ||
	        typeof global.WebkitMutationObserver === "function" ||
	        typeof global.WebKitMutationObserver === "function") &&
	        typeof document !== "undefined" &&
	        typeof document.createElement === "function") {


	    schedule = (function(){
	        var MutationObserver = global.MutationObserver ||
	            global.WebkitMutationObserver ||
	            global.WebKitMutationObserver;
	        var div = document.createElement("div");
	        var queuedFn = void 0;
	        var observer = new MutationObserver(
	            function Promise$_Scheduler() {
	                var fn = queuedFn;
	                queuedFn = void 0;
	                fn();
	            }
	       );
	        observer.observe(div, {
	            attributes: true
	        });
	        return function Promise$_Scheduler(fn) {
	            queuedFn = fn;
	            div.setAttribute("class", "foo");
	        };

	    })();
	}
	else if (typeof global.postMessage === "function" &&
	    typeof global.importScripts !== "function" &&
	    typeof global.addEventListener === "function" &&
	    typeof global.removeEventListener === "function") {

	    var MESSAGE_KEY = "bluebird_message_key_" + Math.random();
	    schedule = (function(){
	        var queuedFn = void 0;

	        function Promise$_Scheduler(e) {
	            if (e.source === global &&
	                e.data === MESSAGE_KEY) {
	                var fn = queuedFn;
	                queuedFn = void 0;
	                fn();
	            }
	        }

	        global.addEventListener("message", Promise$_Scheduler, false);

	        return function Promise$_Scheduler(fn) {
	            queuedFn = fn;
	            global.postMessage(
	                MESSAGE_KEY, "*"
	           );
	        };

	    })();
	}
	else if (typeof global.MessageChannel === "function") {
	    schedule = (function(){
	        var queuedFn = void 0;

	        var channel = new global.MessageChannel();
	        channel.port1.onmessage = function Promise$_Scheduler() {
	                var fn = queuedFn;
	                queuedFn = void 0;
	                fn();
	        };

	        return function Promise$_Scheduler(fn) {
	            queuedFn = fn;
	            channel.port2.postMessage(null);
	        };
	    })();
	}
	else if (global.setTimeout) {
	    schedule = function Promise$_Scheduler(fn) {
	        setTimeout(fn, 4);
	    };
	}
	else {
	    schedule = function Promise$_Scheduler(fn) {
	        fn();
	    };
	}

	module.exports = schedule;
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(7)))

/***/ },
/* 41 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	function arrayCopy(src, srcIndex, dst, dstIndex, len) {
	    for (var j = 0; j < len; ++j) {
	        dst[j + dstIndex] = src[j + srcIndex];
	    }
	}

	function pow2AtLeast(n) {
	    n = n >>> 0;
	    n = n - 1;
	    n = n | (n >> 1);
	    n = n | (n >> 2);
	    n = n | (n >> 4);
	    n = n | (n >> 8);
	    n = n | (n >> 16);
	    return n + 1;
	}

	function getCapacity(capacity) {
	    if (typeof capacity !== "number") return 16;
	    return pow2AtLeast(
	        Math.min(
	            Math.max(16, capacity), 1073741824)
	   );
	}

	function Queue(capacity) {
	    this._capacity = getCapacity(capacity);
	    this._length = 0;
	    this._front = 0;
	    this._makeCapacity();
	}

	Queue.prototype._willBeOverCapacity =
	function Queue$_willBeOverCapacity(size) {
	    return this._capacity < size;
	};

	Queue.prototype._pushOne = function Queue$_pushOne(arg) {
	    var length = this.length();
	    this._checkCapacity(length + 1);
	    var i = (this._front + length) & (this._capacity - 1);
	    this[i] = arg;
	    this._length = length + 1;
	};

	Queue.prototype.push = function Queue$push(fn, receiver, arg) {
	    var length = this.length() + 3;
	    if (this._willBeOverCapacity(length)) {
	        this._pushOne(fn);
	        this._pushOne(receiver);
	        this._pushOne(arg);
	        return;
	    }
	    var j = this._front + length - 3;
	    this._checkCapacity(length);
	    var wrapMask = this._capacity - 1;
	    this[(j + 0) & wrapMask] = fn;
	    this[(j + 1) & wrapMask] = receiver;
	    this[(j + 2) & wrapMask] = arg;
	    this._length = length;
	};

	Queue.prototype.shift = function Queue$shift() {
	    var front = this._front,
	        ret = this[front];

	    this[front] = void 0;
	    this._front = (front + 1) & (this._capacity - 1);
	    this._length--;
	    return ret;
	};

	Queue.prototype.length = function Queue$length() {
	    return this._length;
	};

	Queue.prototype._makeCapacity = function Queue$_makeCapacity() {
	    var len = this._capacity;
	    for (var i = 0; i < len; ++i) {
	        this[i] = void 0;
	    }
	};

	Queue.prototype._checkCapacity = function Queue$_checkCapacity(size) {
	    if (this._capacity < size) {
	        this._resizeTo(this._capacity << 3);
	    }
	};

	Queue.prototype._resizeTo = function Queue$_resizeTo(capacity) {
	    var oldFront = this._front;
	    var oldCapacity = this._capacity;
	    var oldQueue = new Array(oldCapacity);
	    var length = this.length();

	    arrayCopy(this, 0, oldQueue, 0, oldCapacity);
	    this._capacity = capacity;
	    this._makeCapacity();
	    this._front = 0;
	    if (oldFront + length <= oldCapacity) {
	        arrayCopy(oldQueue, oldFront, this, 0, length);
	    }
	    else {        var lengthBeforeWrapping =
	            length - ((oldFront + length) & (oldCapacity - 1));

	        arrayCopy(oldQueue, oldFront, this, 0, lengthBeforeWrapping);
	        arrayCopy(oldQueue, 0, this, lengthBeforeWrapping,
	                    length - lengthBeforeWrapping);
	    }
	};

	module.exports = Queue;


/***/ },
/* 42 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function (PromiseArray) {
	var util = __webpack_require__(12);
	var RangeError = __webpack_require__(14).RangeError;
	var inherits = util.inherits;
	var isArray = util.isArray;

	function SomePromiseArray(values, boundTo) {
	    this.constructor$(values, boundTo);
	    this._howMany = 0;
	    this._unwrap = false;
	    this._initialized = false;
	}
	inherits(SomePromiseArray, PromiseArray);

	SomePromiseArray.prototype._init = function SomePromiseArray$_init() {
	    if (!this._initialized) {
	        return;
	    }
	    if (this._howMany === 0) {
	        this._resolve([]);
	        return;
	    }
	    this._init$(void 0, -2);
	    var isArrayResolved = isArray(this._values);
	    this._holes = isArrayResolved ? this._values.length - this.length() : 0;

	    if (!this._isResolved() &&
	        isArrayResolved &&
	        this._howMany > this._canPossiblyFulfill()) {
	        var message = "(Promise.some) input array contains less than " +
	                        this._howMany  + " promises";
	        this._reject(new RangeError(message));
	    }
	};

	SomePromiseArray.prototype.init = function SomePromiseArray$init() {
	    this._initialized = true;
	    this._init();
	};

	SomePromiseArray.prototype.setUnwrap = function SomePromiseArray$setUnwrap() {
	    this._unwrap = true;
	};

	SomePromiseArray.prototype.howMany = function SomePromiseArray$howMany() {
	    return this._howMany;
	};

	SomePromiseArray.prototype.setHowMany =
	function SomePromiseArray$setHowMany(count) {
	    if (this._isResolved()) return;
	    this._howMany = count;
	};

	SomePromiseArray.prototype._promiseFulfilled =
	function SomePromiseArray$_promiseFulfilled(value) {
	    if (this._isResolved()) return;
	    this._addFulfilled(value);
	    if (this._fulfilled() === this.howMany()) {
	        this._values.length = this.howMany();
	        if (this.howMany() === 1 && this._unwrap) {
	            this._resolve(this._values[0]);
	        }
	        else {
	            this._resolve(this._values);
	        }
	    }

	};
	SomePromiseArray.prototype._promiseRejected =
	function SomePromiseArray$_promiseRejected(reason) {
	    if (this._isResolved()) return;
	    this._addRejected(reason);
	    if (this.howMany() > this._canPossiblyFulfill()) {
	        if (this._values.length === this.length()) {
	            this._reject([]);
	        }
	        else {
	            this._reject(this._values.slice(this.length() + this._holes));
	        }
	    }
	};

	SomePromiseArray.prototype._fulfilled = function SomePromiseArray$_fulfilled() {
	    return this._totalResolved;
	};

	SomePromiseArray.prototype._rejected = function SomePromiseArray$_rejected() {
	    return this._values.length - this.length() - this._holes;
	};

	SomePromiseArray.prototype._addRejected =
	function SomePromiseArray$_addRejected(reason) {
	    this._values.push(reason);
	};

	SomePromiseArray.prototype._addFulfilled =
	function SomePromiseArray$_addFulfilled(value) {
	    this._values[this._totalResolved++] = value;
	};

	SomePromiseArray.prototype._canPossiblyFulfill =
	function SomePromiseArray$_canPossiblyFulfill() {
	    return this.length() - this._rejected();
	};

	return SomePromiseArray;
	};


/***/ },
/* 43 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, INTERNAL) {
	var errors = __webpack_require__(14);
	var TypeError = errors.TypeError;
	var util = __webpack_require__(12);
	var isArray = util.isArray;
	var errorObj = util.errorObj;
	var tryCatch1 = util.tryCatch1;
	var yieldHandlers = [];

	function promiseFromYieldHandler(value) {
	    var _yieldHandlers = yieldHandlers;
	    var _errorObj = errorObj;
	    var _Promise = Promise;
	    var len = _yieldHandlers.length;
	    for (var i = 0; i < len; ++i) {
	        var result = tryCatch1(_yieldHandlers[i], void 0, value);
	        if (result === _errorObj) {
	            return _Promise.reject(_errorObj.e);
	        }
	        var maybePromise = _Promise._cast(result,
	            promiseFromYieldHandler, void 0);
	        if (maybePromise instanceof _Promise) return maybePromise;
	    }
	    return null;
	}

	function PromiseSpawn(generatorFunction, receiver) {
	    var promise = this._promise = new Promise(INTERNAL);
	    promise._setTrace(void 0);
	    this._generatorFunction = generatorFunction;
	    this._receiver = receiver;
	    this._generator = void 0;
	}

	PromiseSpawn.prototype.promise = function PromiseSpawn$promise() {
	    return this._promise;
	};

	PromiseSpawn.prototype._run = function PromiseSpawn$_run() {
	    this._generator = this._generatorFunction.call(this._receiver);
	    this._receiver =
	        this._generatorFunction = void 0;
	    this._next(void 0);
	};

	PromiseSpawn.prototype._continue = function PromiseSpawn$_continue(result) {
	    if (result === errorObj) {
	        this._generator = void 0;
	        var trace = errors.canAttach(result.e)
	            ? result.e : new Error(result.e + "");
	        this._promise._attachExtraTrace(trace);
	        this._promise._reject(result.e, trace);
	        return;
	    }

	    var value = result.value;
	    if (result.done === true) {
	        this._generator = void 0;
	        if (!this._promise._tryFollow(value)) {
	            this._promise._fulfill(value);
	        }
	    }
	    else {
	        var maybePromise = Promise._cast(value, PromiseSpawn$_continue, void 0);
	        if (!(maybePromise instanceof Promise)) {
	            if (isArray(maybePromise)) {
	                maybePromise = Promise.all(maybePromise);
	            }
	            else {
	                maybePromise = promiseFromYieldHandler(maybePromise);
	            }
	            if (maybePromise === null) {
	                this._throw(new TypeError("A value was yielded that could not be treated as a promise"));
	                return;
	            }
	        }
	        maybePromise._then(
	            this._next,
	            this._throw,
	            void 0,
	            this,
	            null
	       );
	    }
	};

	PromiseSpawn.prototype._throw = function PromiseSpawn$_throw(reason) {
	    if (errors.canAttach(reason))
	        this._promise._attachExtraTrace(reason);
	    this._continue(
	        tryCatch1(this._generator["throw"], this._generator, reason)
	   );
	};

	PromiseSpawn.prototype._next = function PromiseSpawn$_next(value) {
	    this._continue(
	        tryCatch1(this._generator.next, this._generator, value)
	   );
	};

	PromiseSpawn.addYieldHandler = function PromiseSpawn$AddYieldHandler(fn) {
	    if (typeof fn !== "function") throw new TypeError("fn must be a function");
	    yieldHandlers.push(fn);
	};

	return PromiseSpawn;
	};


/***/ },
/* 44 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, PromiseArray) {
	var util = __webpack_require__(12);
	var inherits = util.inherits;
	var es5 = __webpack_require__(39);

	function PropertiesPromiseArray(obj, boundTo) {
	    var keys = es5.keys(obj);
	    var values = new Array(keys.length);
	    for (var i = 0, len = values.length; i < len; ++i) {
	        values[i] = obj[keys[i]];
	    }
	    this.constructor$(values, boundTo);
	    if (!this._isResolved()) {
	        for (var i = 0, len = keys.length; i < len; ++i) {
	            values.push(keys[i]);
	        }
	    }
	}
	inherits(PropertiesPromiseArray, PromiseArray);

	PropertiesPromiseArray.prototype._init =
	function PropertiesPromiseArray$_init() {
	    this._init$(void 0, -3) ;
	};

	PropertiesPromiseArray.prototype._promiseFulfilled =
	function PropertiesPromiseArray$_promiseFulfilled(value, index) {
	    if (this._isResolved()) return;
	    this._values[index] = value;
	    var totalResolved = ++this._totalResolved;
	    if (totalResolved >= this._length) {
	        var val = {};
	        var keyOffset = this.length();
	        for (var i = 0, len = this.length(); i < len; ++i) {
	            val[this._values[i + keyOffset]] = this._values[i];
	        }
	        this._resolve(val);
	    }
	};

	PropertiesPromiseArray.prototype._promiseProgressed =
	function PropertiesPromiseArray$_promiseProgressed(value, index) {
	    if (this._isResolved()) return;

	    this._promise._progress({
	        key: this._values[index + this.length()],
	        value: value
	    });
	};

	PromiseArray.PropertiesPromiseArray = PropertiesPromiseArray;

	return PropertiesPromiseArray;
	};


/***/ },
/* 45 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2014 Petka Antonov
	 * 
	 * Permission is hereby granted, free of charge, to any person obtaining a copy
	 * of this software and associated documentation files (the "Software"), to deal
	 * in the Software without restriction, including without limitation the rights
	 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 * copies of the Software, and to permit persons to whom the Software is
	 * furnished to do so, subject to the following conditions:</p>
	 * 
	 * The above copyright notice and this permission notice shall be included in
	 * all copies or substantial portions of the Software.
	 * 
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 * THE SOFTWARE.
	 * 
	 */
	"use strict";
	module.exports = function(Promise, PromiseArray) {
	var PromiseInspection = Promise.PromiseInspection;
	var util = __webpack_require__(12);
	var inherits = util.inherits;
	function SettledPromiseArray(values, boundTo) {
	    this.constructor$(values, boundTo);
	}
	inherits(SettledPromiseArray, PromiseArray);

	SettledPromiseArray.prototype._promiseResolved =
	function SettledPromiseArray$_promiseResolved(index, inspection) {
	    this._values[index] = inspection;
	    var totalResolved = ++this._totalResolved;
	    if (totalResolved >= this._length) {
	        this._resolve(this._values);
	    }
	};

	SettledPromiseArray.prototype._promiseFulfilled =
	function SettledPromiseArray$_promiseFulfilled(value, index) {
	    if (this._isResolved()) return;
	    var ret = new PromiseInspection();
	    ret._bitField = 268435456;
	    ret._settledValue = value;
	    this._promiseResolved(index, ret);
	};
	SettledPromiseArray.prototype._promiseRejected =
	function SettledPromiseArray$_promiseRejected(reason, index) {
	    if (this._isResolved()) return;
	    var ret = new PromiseInspection();
	    ret._bitField = 134217728;
	    ret._settledValue = reason;
	    this._promiseResolved(index, ret);
	};

	return SettledPromiseArray;
	};


/***/ }
/******/ ])
})

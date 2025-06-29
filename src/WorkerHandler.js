'use strict';

var {Promise} = require('./Promise');
var environment = require('./environment');
const {validateOptions, forkOptsNames, workerThreadOptsNames, workerOptsNames} = require("./validateOptions");

/**
 * Special message sent by parent which causes a child process worker to terminate itself.
 * Not a "message object"; this string is the entire message.
 */
var TERMINATE_METHOD_ID = '__workerpool-terminate__';

/**
 * Special message by parent which causes a child process worker to perform cleaup
 * steps before determining if the child process worker should be terminated.
 */
var CLEANUP_METHOD_ID = '__workerpool-cleanup__';

function ensureWorkerThreads() {
  var WorkerThreads = tryRequireWorkerThreads()
  if (!WorkerThreads) {
    throw new Error('WorkerPool: workerType = \'thread\' is not supported, Node >= 11.7.0 required')
  }

  return WorkerThreads;
}

// check whether Worker is supported by the browser
function ensureWebWorker() {
  // Workaround for a bug in PhantomJS (Or QtWebkit): https://github.com/ariya/phantomjs/issues/14534
  if (typeof Worker !== 'function' && (typeof Worker !== 'object' || typeof Worker.prototype.constructor !== 'function')) {
    throw new Error('WorkerPool: Web Workers not supported');
  }
}

function tryRequireWorkerThreads() {
  try {
    return require('worker_threads');
  } catch(error) {
    if (typeof error === 'object' && error !== null && error.code === 'MODULE_NOT_FOUND') {
      // no worker_threads available (old version of node.js)
      return null;
    } else {
      throw error;
    }
  }
}

// get the default worker script
function getDefaultWorker() {
  if (environment.platform === 'browser') {
    // test whether the browser supports all features that we need
    if (typeof Blob === 'undefined') {
      throw new Error('Blob not supported by the browser');
    }
    if (!window.URL || typeof window.URL.createObjectURL !== 'function') {
      throw new Error('URL.createObjectURL not supported by the browser');
    }

    // use embedded worker.js
    var blob = new Blob([require('./generated/embeddedWorker')], {type: 'text/javascript'});
    return window.URL.createObjectURL(blob);
  }
  else {
    // use external worker.js in current directory
    return __dirname + '/worker.js';
  }
}

function setupWorker(script, options) {
  if (options.workerType === 'web') { // browser only
    ensureWebWorker();
    return setupBrowserWorker(script, options.workerOpts, Worker);
  } else if (options.workerType === 'thread') { // node.js only
    WorkerThreads = ensureWorkerThreads();
    return setupWorkerThreadWorker(script, WorkerThreads, options);
  } else if (options.workerType === 'process' || !options.workerType) { // node.js only
    return setupProcessWorker(script, resolveForkOptions(options), require('child_process'));
  } else { // options.workerType === 'auto' or undefined
    if (environment.platform === 'browser') {
      ensureWebWorker();
      return setupBrowserWorker(script, options.workerOpts, Worker);
    }
    else { // environment.platform === 'node'
      var WorkerThreads = tryRequireWorkerThreads();
      if (WorkerThreads) {
        return setupWorkerThreadWorker(script, WorkerThreads, options);
      } else {
        return setupProcessWorker(script, resolveForkOptions(options), require('child_process'));
      }
    }
  }
}

function setupBrowserWorker(script, workerOpts, Worker) {
  // validate the options right before creating the worker (not when creating the pool)
  validateOptions(workerOpts, workerOptsNames, 'workerOpts')

  // create the web worker
  var worker = new Worker(script, workerOpts);

  worker.isBrowserWorker = true;
  // add node.js API to the web worker
  worker.on = function (event, callback) {
    this.addEventListener(event, function (message) {
      callback(message.data);
    });
  };
  worker.send = function (message, transfer) {
    this.postMessage(message, transfer);
  };
  return worker;
}

function setupWorkerThreadWorker(script, WorkerThreads, options) {
  // validate the options right before creating the worker thread (not when creating the pool)
  validateOptions(options?.workerThreadOpts, workerThreadOptsNames, 'workerThreadOpts')

  var worker = new WorkerThreads.Worker(script, {
    stdout: options?.emitStdStreams ?? false, // pipe worker.STDOUT to process.STDOUT if not requested
    stderr: options?.emitStdStreams ?? false,  // pipe worker.STDERR to process.STDERR if not requested
    ...options?.workerThreadOpts
  });
  worker.isWorkerThread = true;
  worker.send = function(message, transfer) {
    this.postMessage(message, transfer);
  };

  worker.kill = function() {
    this.terminate();
    return true;
  };

  worker.disconnect = function() {
    this.terminate();
  };

  if (options?.emitStdStreams) {
    worker.stdout.on('data', (data) => worker.emit("stdout", data))
    worker.stderr.on('data', (data) => worker.emit("stderr", data))
  }

  return worker;
}

function setupProcessWorker(script, options, child_process) {
  // validate the options right before creating the child process (not when creating the pool)
  validateOptions(options.forkOpts, forkOptsNames, 'forkOpts')

  // no WorkerThreads, fallback to sub-process based workers
  var worker = child_process.fork(
    script,
    options.forkArgs,
    options.forkOpts
  );

  // ignore transfer argument since it is not supported by process
  var send = worker.send;
  worker.send = function (message) {
    return send.call(worker, message);
  };

  if (options.emitStdStreams) {
    worker.stdout.on('data', (data) => worker.emit("stdout", data))
    worker.stderr.on('data', (data) => worker.emit("stderr", data))
  }

  worker.isChildProcess = true;
  return worker;
}

// add debug flags to child processes if the node inspector is active
function resolveForkOptions(opts) {
  opts = opts || {};

  var processExecArgv = process.execArgv.join(' ');
  var inspectorActive = processExecArgv.indexOf('--inspect') !== -1;
  var debugBrk = processExecArgv.indexOf('--debug-brk') !== -1;

  var execArgv = [];
  if (inspectorActive) {
    execArgv.push('--inspect=' + opts.debugPort);

    if (debugBrk) {
      execArgv.push('--debug-brk');
    }
  }

  process.execArgv.forEach(function(arg) {
    if (arg.indexOf('--max-old-space-size') > -1) {
      execArgv.push(arg)
    }
  })

  return Object.assign({}, opts, {
    forkArgs: opts.forkArgs,
    forkOpts: Object.assign({}, opts.forkOpts, {
      execArgv: (opts.forkOpts && opts.forkOpts.execArgv || [])
      .concat(execArgv),
      stdio: opts.emitStdStreams ? "pipe": undefined
    })
  });
}

/**
 * Converts a serialized error to Error
 * @param {Object} obj Error that has been serialized and parsed to object
 * @return {Error} The equivalent Error.
 */
function objectToError (obj) {
  var temp = new Error('')
  var props = Object.keys(obj)

  for (var i = 0; i < props.length; i++) {
    temp[props[i]] = obj[props[i]]
  }

  return temp
}

function handleEmittedStdPayload(handler, payload) {
  // TODO: refactor if parallel task execution gets added
  Object.values(handler.processing)
    .forEach(task => task?.options?.on(payload));
  
  Object.values(handler.tracking)
    .forEach(task => task?.options?.on(payload)); 
}

/**
 * A WorkerHandler controls a single worker. This worker can be a child process
 * on node.js or a WebWorker in a browser environment.
 * @param {String} [script] If no script is provided, a default worker with a
 *                          function run will be created.
 * @param {import('./types.js').WorkerPoolOptions} [_options] See docs
 * @constructor
 */
function WorkerHandler(script, _options) {
  var me = this;
  var options = _options || {};

  this.script = script || getDefaultWorker();
  this.worker = setupWorker(this.script, options);
  this.debugPort = options.debugPort;
  this.forkOpts = options.forkOpts;
  this.forkArgs = options.forkArgs;
  this.workerOpts = options.workerOpts;
  this.workerThreadOpts = options.workerThreadOpts
  this.workerTerminateTimeout = options.workerTerminateTimeout;

  // The ready message is only sent if the worker.add method is called (And the default script is not used)
  if (!script) {
    this.worker.ready = true;
  }

  // queue for requests that are received before the worker is ready
  this.requestQueue = [];

  this.worker.on("stdout", function (data) {
    handleEmittedStdPayload(me, {"stdout": data.toString()})
  })
  this.worker.on("stderr", function (data) {
    handleEmittedStdPayload(me, {"stderr": data.toString()})
  })

  this.worker.on('message', function (response) {
    if (me.terminated) {
      return;
    }
    if (typeof response === 'string' && response === 'ready') {
      me.worker.ready = true;
      dispatchQueuedRequests();
    } else {
      // find the task from the processing queue, and run the tasks callback
      var id = response.id;
      var task = me.processing[id];
      if (task !== undefined) {
        if (response.isEvent) {
          if (task.options && typeof task.options.on === 'function') {
            task.options.on(response.payload);
          }
        } else {
          // remove the task from the queue
          delete me.processing[id];

          // test if we need to terminate
          if (me.terminating === true) {
            // complete worker termination if all tasks are finished
            me.terminate();
          }

          // resolve the task's promise
          if (response.error) {
            task.resolver.reject(objectToError(response.error));
          }
          else {
            task.resolver.resolve(response.result);
          }
        }
      } else {
        // if the task is not the current, it might be tracked for cleanup
        var task = me.tracking[id];
        if (task !== undefined) {
          if (response.isEvent) {
            if (task.options && typeof task.options.on === 'function') {
              task.options.on(response.payload);
            }
          }
        } 
      }

      if (response.method === CLEANUP_METHOD_ID) {
        var trackedTask = me.tracking[response.id];
        if (trackedTask !== undefined) {
          if (response.error) {
            clearTimeout(trackedTask.timeoutId);
            trackedTask.resolver.reject(objectToError(response.error))
          } else {
            me.tracking && clearTimeout(trackedTask.timeoutId);
            // if we do not encounter an error wrap the the original timeout error and reject
            trackedTask.resolver.reject(new WrappedTimeoutError(trackedTask.error));
          }
        }
        delete me.tracking[id];
      }
    }
  });

  // reject all running tasks on worker error
  function onError(error) {
    me.terminated = true;

    for (var id in me.processing) {
      if (me.processing[id] !== undefined) {
        me.processing[id].resolver.reject(error);
      }
    }
    
    me.processing = Object.create(null);
  }

  // send all queued requests to worker
  function dispatchQueuedRequests()
  {
    for(const request of me.requestQueue.splice(0)) {
      me.worker.send(request.message, request.transfer);
    }
  }

  var worker = this.worker;
  // listen for worker messages error and exit
  this.worker.on('error', onError);
  this.worker.on('exit', function (exitCode, signalCode) {
    var message = 'Workerpool Worker terminated Unexpectedly\n';

    message += '    exitCode: `' + exitCode + '`\n';
    message += '    signalCode: `' + signalCode + '`\n';

    message += '    workerpool.script: `' +  me.script + '`\n';
    message += '    spawnArgs: `' +  worker.spawnargs + '`\n';
    message += '    spawnfile: `' + worker.spawnfile + '`\n'

    message += '    stdout: `' + worker.stdout + '`\n'
    message += '    stderr: `' + worker.stderr + '`\n'

    onError(new Error(message));
  });

  this.processing = Object.create(null); // queue with tasks currently in progress
  this.tracking = Object.create(null); // queue with tasks being monitored for cleanup status
  this.terminating = false;
  this.terminated = false;
  this.cleaning = false;
  this.terminationHandler = null;
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
 * @param {import('./types.js').ExecOptions}  [options]
 * @return {Promise.<*, Error>} result
 */
WorkerHandler.prototype.exec = function(method, params, resolver, options) {
  if (!resolver) {
    resolver = Promise.defer();
  }

  // generate a unique id for the task
  var id = ++this.lastId;

  // register a new task as being in progress
  this.processing[id] = {
    id: id,
    resolver: resolver,
    options: options
  };

  // build a JSON-RPC request
  var request = {
    message: {
      id: id,
      method: method,
      params: params
    },
    transfer: options && options.transfer
  };

  if (this.terminated) {
    resolver.reject(new Error('Worker is terminated'));
  } else if (this.worker.ready) {
    // send the request to the worker
    this.worker.send(request.message, request.transfer);
  } else {
    this.requestQueue.push(request);
  }

  // on cancellation, force the worker to terminate
  var me = this;
  return resolver.promise.catch(function (error) {
    if (error instanceof Promise.CancellationError || error instanceof Promise.TimeoutError) {
      me.tracking[id] = {
        id,
        resolver: Promise.defer(),
        options: options,
        error,
      };
      
      // remove this task from the queue. It is already rejected (hence this
      // catch event), and else it will be rejected again when terminating
      delete me.processing[id];

      me.tracking[id].resolver.promise = me.tracking[id].resolver.promise.catch(function(err) {
        delete me.tracking[id];

        // if we find the error is an instance of WrappedTimeoutError we know the error should not cause termination
        // as the response from the worker did not contain an error. We still wish to throw the original timeout error
        // to the caller.
        if (err instanceof WrappedTimeoutError) {
          throw err.error;
        }

        var promise = me.terminateAndNotify(true)
          .then(function() { 
            throw err;
          }, function(err) {
            throw err;
          });

        return promise;
      });
 
      me.worker.send({
        id,
        method: CLEANUP_METHOD_ID 
      });
      
      
      /**
        * Sets a timeout to reject the cleanup operation if the message sent to the worker
        * does not receive a response. see worker.tryCleanup for worker cleanup operations.
        * Here we use the workerTerminateTimeout as the worker will be terminated if the timeout does invoke.
        * 
        * We need this timeout in either case of a Timeout or Cancellation Error as if
        * the worker does not send a message we still need to give a window of time for a response.
        * 
        * The workerTermniateTimeout is used here if this promise is rejected the worker cleanup
        * operations will occure.
      */
      me.tracking[id].timeoutId = setTimeout(function() {
          me.tracking[id].resolver.reject(error);
      }, me.workerTerminateTimeout);

      return me.tracking[id].resolver.promise;
    } else {
      throw error;
    }
  })
};

/**
 * Test whether the worker is processing any tasks or cleaning up before termination.
 * @return {boolean} Returns true if the worker is busy
 */
WorkerHandler.prototype.busy = function () {
  return this.cleaning || Object.keys(this.processing).length > 0;
};

/**
 * Terminate the worker.
 * @param {boolean} [force=false]   If false (default), the worker is terminated
 *                                  after finishing all tasks currently in
 *                                  progress. If true, the worker will be
 *                                  terminated immediately.
 * @param {function} [callback=null] If provided, will be called when process terminates.
 */
WorkerHandler.prototype.terminate = function (force, callback) {
  var me = this;
  if (force) {
    // cancel all tasks in progress
    for (var id in this.processing) {
      if (this.processing[id] !== undefined) {
        this.processing[id].resolver.reject(new Error('Worker terminated'));
      }
    }

    this.processing = Object.create(null);
  }

  // If we are terminating, cancel all tracked task for cleanup
  for (var task of Object.values(me.tracking)) {
    clearTimeout(task.timeoutId);
    task.resolver.reject(new Error('Worker Terminating'));
  }

  me.tracking = Object.create(null);

  if (typeof callback === 'function') {
    this.terminationHandler = callback;
  }
  if (!this.busy()) {
    // all tasks are finished. kill the worker
    var cleanup = function(err) {
      me.terminated = true;
      me.cleaning = false;

      if (me.worker != null && me.worker.removeAllListeners) {
        // removeAllListeners is only available for child_process
        me.worker.removeAllListeners('message');
      }
      me.worker = null;
      me.terminating = false;
      if (me.terminationHandler) {
        me.terminationHandler(err, me);
      } else if (err) {
        throw err;
      }
    }

    if (this.worker) {
      if (typeof this.worker.kill === 'function') {
        if (this.worker.killed) {
          cleanup(new Error('worker already killed!'));
          return;
        }

        // child process and worker threads
        var cleanExitTimeout = setTimeout(function() {
          if (me.worker) {
            me.worker.kill();
          }
        }, this.workerTerminateTimeout);

        this.worker.once('exit', function() {
          clearTimeout(cleanExitTimeout);
          if (me.worker) {
            me.worker.killed = true;
          }
          cleanup();
        });

        if (this.worker.ready) {
          this.worker.send(TERMINATE_METHOD_ID);
        } else {
          this.requestQueue.push({ message: TERMINATE_METHOD_ID });
        }

        // mark that the worker is cleaning up resources
        // to prevent new tasks from being executed
        this.cleaning = true;
        return;
      }
      else if (typeof this.worker.terminate === 'function') {
        this.worker.terminate(); // web worker
        this.worker.killed = true;
      }
      else {
        throw new Error('Failed to terminate worker');
      }
    }
    cleanup();
  }
  else {
    // we can't terminate immediately, there are still tasks being executed
    this.terminating = true;
  }
};

/**
 * Terminate the worker, returning a Promise that resolves when the termination has been done.
 * @param {boolean} [force=false]   If false (default), the worker is terminated
 *                                  after finishing all tasks currently in
 *                                  progress. If true, the worker will be
 *                                  terminated immediately.
 * @param {number} [timeout]        If provided and non-zero, worker termination promise will be rejected
 *                                  after timeout if worker process has not been terminated.
 * @return {Promise.<WorkerHandler, Error>}
 */
WorkerHandler.prototype.terminateAndNotify = function (force, timeout) {
  var resolver = Promise.defer();
  if (timeout) {
    resolver.promise.timeout(timeout);
  }
  this.terminate(force, function(err, worker) {
    if (err) {
      resolver.reject(err);
    } else {
      resolver.resolve(worker);
    }
  });
  return resolver.promise;
};

/**
* Wrapper error type to denote that a TimeoutError has already been proceesed
* and we should skip cleanup operations
* @param {Promise.TimeoutError} timeoutError
*/
function WrappedTimeoutError(timeoutError) {
  this.error = timeoutError;
  this.stack = (new Error()).stack;
}

module.exports = WorkerHandler;
module.exports._tryRequireWorkerThreads = tryRequireWorkerThreads;
module.exports._setupProcessWorker = setupProcessWorker;
module.exports._setupBrowserWorker = setupBrowserWorker;
module.exports._setupWorkerThreadWorker = setupWorkerThreadWorker;
module.exports.ensureWorkerThreads = ensureWorkerThreads;

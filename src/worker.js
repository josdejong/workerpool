/**
 * worker must be started as a child process or a web worker.
 * It listens for RPC messages from the parent process.
 */
const { addAbortListener } = require('events');
var Transfer = require('./transfer');

/**
 * worker must handle async cleanup handlers. Use custom Promise implementation. 
*/
var Promise = require('./Promise').Promise;
/**
 * Special message sent by parent which causes the worker to terminate itself.
 * Not a "message object"; this string is the entire message.
 */
var TERMINATE_METHOD_ID = '__workerpool-terminate__';

/**
 * Special message by parent which causes a child process worker to perform cleaup
 * steps before determining if the child process worker should be terminated.
*/
var CLEANUP_METHOD_ID = '__workerpool-cleanup__';
// var nodeOSPlatform = require('./environment').nodeOSPlatform;


var TIMEOUT_DEFAULT = 1_000;

// create a worker API for sending and receiving messages which works both on
// node.js and in the browser
var worker = {
  exit: function() {}
};

// api for in worker communication with parent process
// works in both node.js and the browser
var publicWorker = {
  /**
   * 
   * @param {() => Promise<void>} listener 
   */
  addAbortListener: function(listener) {
    worker.abortListeners.push(listener);
  },

  emit: worker.emit
};

if (typeof self !== 'undefined' && typeof postMessage === 'function' && typeof addEventListener === 'function') {
  // worker in the browser
  worker.on = function (event, callback) {
    addEventListener(event, function (message) {
      callback(message.data);
    })
  };
  worker.send = function (message, transfer) {
     transfer ? postMessage(message, transfer) : postMessage (message);
  };
}
else if (typeof process !== 'undefined') {
  // node.js

  var WorkerThreads;
  try {
    WorkerThreads = require('worker_threads');
  } catch(error) {
    if (typeof error === 'object' && error !== null && error.code === 'MODULE_NOT_FOUND') {
      // no worker_threads, fallback to sub-process based workers
    } else {
      throw error;
    }
  }

  if (WorkerThreads &&
    /* if there is a parentPort, we are in a WorkerThread */
    WorkerThreads.parentPort !== null) {
    var parentPort  = WorkerThreads.parentPort;
    worker.send = parentPort.postMessage.bind(parentPort);
    worker.on = parentPort.on.bind(parentPort);
    worker.exit = process.exit.bind(process);
  } else {
    worker.on = process.on.bind(process);
    // ignore transfer argument since it is not supported by process
    worker.send = function (message) {
      process.send(message);
    };
    // register disconnect handler only for subprocess worker to exit when parent is killed unexpectedly
    worker.on('disconnect', function () {
      process.exit(1);
    });
    worker.exit = process.exit.bind(process);
  }
}
else {
  throw new Error('Script must be executed as a worker');
}

function convertError(error) {
  return Object.getOwnPropertyNames(error).reduce(function(product, name) {
    return Object.defineProperty(product, name, {
	value: error[name],
	enumerable: true
    });
  }, {});
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
  var f = new Function('return (' + fn + ').apply(this, arguments);');
  f.worker = publicWorker;
  return f.apply(f, args);
};

/**
 * Get a list with methods available on this worker
 * @return {String[]} methods
 */
worker.methods.methods = function methods() {
  return Object.keys(worker.methods);
};

/**
 * Custom handler for when the worker is terminated.
 */
worker.terminationHandler = undefined;

worker.abortListenerTimeout = 1000;

/**
 * Abort handlers for resolving errors which may cause a timeout or cancellation
 * to occur from a worker context
 */
worker.abortListeners = [];

/**
 * Cleanup and exit the worker.
 * @param {Number} code 
 * @returns 
 */
worker.cleanupAndExit = function(code) {
  var _exit = function() {
    worker.exit(code);
  }

  if(!worker.terminationHandler) {
    return _exit();
  }
  
  var result = worker.terminationHandler(code);
  if (isPromise(result)) {
    result.then(_exit, _exit);
  } else {
    _exit();
  }
}

worker.tryCleanup = function() {
  var _exit = function() {
    worker.exit();
  }

  var _abort = function() {
    if (!worker.abortListeners.length) {
      worker.abortListeners = [];
    }
  }

  if (worker.abortListeners.length) {
    let promises = [];
    for (var i = 0; i < worker.abortListeners.length; i++) {
      promises.push(
        worker.abortListeners[i]()
      )
    }

    let timerId;
    const timeoutPromise = new Promise((_resolve, reject) => {
      timerId = setTimeout(function() {
        reject();
      }, worker.abortListenerTimeout);
    });

    // Once a promise settles we need to clear the timeout to prevet fulfulling the promise twice 
    const settlePromise = Promise.all(promises).then(function() {
      clearTimeout(timerId);
      _abort();
    }, function() {
      clearTimeout(timerId);
      _exit();
    });


    return Promise.all([
      settlePromise,
      timeoutPromise
    ]);
  }
  // if there are no listeners just reject in a promise and let the worker cleanup start
  return new Promise(function(_resolve, reject) { reject(); });
}

var currentRequestId = null;

worker.on('message', function (request) {
  if (request === TERMINATE_METHOD_ID) {
    return worker.cleanupAndExit(0);
  }

  if (request.method === CLEANUP_METHOD_ID) {
    return worker.tryCleanup().then(function () {
      worker.send({
        id: request.id,
        method: CLEANUP_METHOD_ID,
        error: null,
      });
    }).catch(function(err) {
      worker.send({
        id: request.id,
        method: CLEANUP_METHOD_ID,
        error: err ? convertError(err) : null,
      });

      worker.exit();
    });
  }
  try {
    var method = worker.methods[request.method];

    if (method) {
      currentRequestId = request.id;
      
      // execute the function
      var result = method.apply(method, request.params);

      if (isPromise(result)) {
        // promise returned, resolve this and then return
        result
            .then(function (result) {
              if (result instanceof Transfer) {
                worker.send({
                  id: request.id,
                  result: result.message,
                  error: null
                }, result.transfer);
              } else {
                worker.send({
                  id: request.id,
                  result: result,
                  error: null
                });
              }
              currentRequestId = null;
            })
            .catch(function (err) {
              worker.send({
                id: request.id,
                result: null,
                error: convertError(err),
              });
              currentRequestId = null;
            });
      }
      else {
        // immediate result
        if (result instanceof Transfer) {
          worker.send({
            id: request.id,
            result: result.message,
            error: null
          }, result.transfer);
        } else {
          worker.send({
            id: request.id,
            result: result,
            error: null
          });
        }

        currentRequestId = null;
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
      error: convertError(err)
    });
  }
});

/**
 * Register methods to the worker
 * @param {Object} [methods]
 * @param {import('./types.js').WorkerRegisterOptions} [options]
 */
worker.register = function (methods, options) {

  if (methods) {
    for (var name in methods) {
      if (methods.hasOwnProperty(name)) {
        worker.methods[name] = methods[name];
        worker.methods[name].worker = publicWorker;
      }
    }
  }

  if (options) {
    worker.terminationHandler = options.onTerminate || TIMEOUT_DEFAULT;
    // register listener timeout or default to 1 second
    worker.abortListenerTimeout = options.abortListenerTimeout || TIMEOUT_DEFAULT;
  }

  worker.send('ready');
};

worker.emit = function (payload) {
  if (currentRequestId) {
    if (payload instanceof Transfer) {
      worker.send({
        id: currentRequestId,
        isEvent: true,
        payload: payload.message
      }, payload.transfer);
      return;
    }

    worker.send({
      id: currentRequestId,
      isEvent: true,
      payload
    });
  }
};


if (typeof exports !== 'undefined') {
  exports.add = worker.register;
  exports.emit = worker.emit;
}

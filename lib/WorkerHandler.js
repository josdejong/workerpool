var Promise = require('bluebird'),
    child_process = require('child_process');

// determine environment
var environment = require('./environment');

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
    var blob = new Blob([require('./embeddedWorker')], {type: 'text/javascript'});
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
          task.resolver.reject(response.error);
        }
        else {
          task.resolver.resolve(response.result);
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
 * @param {PromiseResolver} [resolver]
 * @return {Promise.<*, Error>} result
 */
WorkerHandler.prototype.exec = function(method, params, resolver) {
  var me = this;
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

  return resolver.promise;
  /* TODO
  // on cancellation, force the worker to terminate
  return resolver.promise
      .cancellable()
      .catch(Promise.CancellationError, function(error) {
        // terminate worker
        me.terminate(true);

        // rethrow the error
        throw error;
      });
      */
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

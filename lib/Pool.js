var child_process = require('child_process'),
    Promise = require('bluebird');

/**
 * A pool to manage workers
 * @param {Object} [options]
 * @constructor
 */
function Pool(options) {
  // configuration
  if (options && 'maxWorkers' in options) {
    if (!isNumber(options.maxWorkers) || !isInteger(options.maxWorkers) || options.maxWorkers < 1) {
      throw new TypeError('Option maxWorkers must be a positive integer number');
    }
    this.maxWorkers = options.maxWorkers;
  }
  else {
    var numCPUs = require('os').cpus().length; // TODO: this is not available on the browser
    this.maxWorkers = Math.max(numCPUs - 1, 1);
  }

  // queues
  this.workers = [];      // queue with all workers
  this.available = [];    // queue with available workers
  this.terminate = [];    // queue with workers to be terminated after they finish their current task
  this.tasks = [];        // queue with tasks awaiting execution
  this.processing = {};   // queue with tasks in progress

  this.lastId = 0;        // Counter for generating unique task id's
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
  // TODO: validate type of fn and args

  var me = this;
  var id = ++me.lastId;
  var request = {
    id: id,
    method: 'run',
    params: {
      fn: fn + '', // stringify the function
      args: args || []
    }
  };

  return new Promise(function (resolve, reject) {
    // add the task to the queue
    var task = {
      request: request,
      resolve: resolve,
      reject: reject
    };
    me.tasks.push(task);

    // trigger task execution
    me._next();
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
      var id = task.request.id;

      task.callback = function (error, result) {
        // free the worker
        me._freeWorker(worker);

        // cleanup the task
        delete me.processing[id];

        // resolve the tasks promise
        try {
          if (error) {
            task.reject(error);
          }
          else {
            task.resolve(result);
          }
        }
        catch (err) {}

        // trigger next task in the queue
        me._next();
      };

      this.processing[id] = task;

      // send the request to the worker
      worker.send(task.request);
    }
  }
};

/**
 * Get an available worker. If no worker is available and the maximum number
 * of workers isn't yet reached, a new worker will be created and returned.
 * If no worker is available and the maximum number of workers is reached,
 * null will be returned.
 *
 * After being finished with a worker, the worker must be returned to the pool
 * with available workers via `Pool._freeWorker(worker)`.
 *
 * @return {Object | null} worker
 * @private
 */
Pool.prototype._getWorker = function() {
  var worker = this.available.shift();
  if (worker) {
    return worker;
  }

  if (this.workers.length < this.maxWorkers) {
    worker = this._newWorker();
    if (worker) {
      return worker;
    }
  }

  return null;
};

/**
 * Mark a worker as available, return it to the pool
 * @param {Object} worker
 * @private
 */
Pool.prototype._freeWorker = function (worker) {
  // check whether this worker is on the list to be terminated
  var termIndex = this.terminate.indexOf(worker);
  if (termIndex == -1) {
    // make this worker available again
    var index = this.available.indexOf(worker);
    if (index == -1) {
      this.available.push(worker);
    }
  }
  else {
    // terminate this worker
    worker.kill();
    this.terminate.splice(termIndex, 1);
  }
};

/**
 * Create a new worker;
 * @returns {Object} worker
 * @private
 */
Pool.prototype._newWorker = function () {
  var me = this;
  var worker = child_process.fork(__dirname + '/Worker.js');

  worker.on('message', function (response) {
    // find the task from the processing queue, and run the tasks callback
    var id = response.id;
    var task = me.processing[id];
    if (task) {
      task.callback(response.error, response.result);
    }
  });

  // TODO: handle crashing of a worker

  // add this worker to the list with all workers
  this.workers.push(worker);

  return worker;
};

/**
 * Close all active workers. Tasks currently being executed will be finished first.
 */
Pool.prototype.clear = function () {
  var me = this;

  this.workers.forEach(function (worker) {
    if (me.available.indexOf(worker) != -1) {
      // worker is available, kill it now
      worker.kill();
    }
    else {
      // worker is busy, kill it after its task is finished
      me.terminate.push(worker);
    }
  });

  this.workers = [];
  this.available = [];
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

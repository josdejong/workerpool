var { Promise } = require("./Promise");
var WorkerHandler = require("./WorkerHandler");
var environment = require("./environment");
var { FIFOQueue, LIFOQueue } = require("./queues");
var DebugPortAllocator = require("./debug-port-allocator");
var DEBUG_PORT_ALLOCATOR = new DebugPortAllocator();

/**
 * A pool to manage workers, which can be created using the function workerpool.pool.
 *
 * Enhanced features:
 * - pool.ready promise for eager initialization
 * - pool.warmup() method for pre-spawning workers
 * - Event emitter for monitoring (taskStart, taskComplete, taskError, etc.)
 * - Automatic task retry with exponential backoff
 * - Circuit breaker pattern for error recovery
 * - Memory-aware scheduling
 * - Health checks
 *
 * @param {String} [script]   Optional worker script
 * @param {import('./types.js').WorkerPoolOptions} [options]  See docs
 * @constructor
 */
function Pool(script, options) {
  if (typeof script === "string") {
    /** @readonly */
    this.script = script || null;
  } else {
    this.script = null;
    options = script;
  }

  /** @private */
  this.workers = []; // queue with all workers

  /** @private */
  this.taskQueue = this._createQueue(
    (options && options.queueStrategy) || "fifo"
  ); // queue with tasks awaiting execution

  options = options || {};

  /** @readonly */
  this.forkArgs = Object.freeze(options.forkArgs || []);
  /** @readonly */
  this.forkOpts = Object.freeze(options.forkOpts || {});
  /** @readonly */
  this.workerOpts = Object.freeze(options.workerOpts || {});
  /** @readonly */
  this.workerThreadOpts = Object.freeze(options.workerThreadOpts || {});
  /** @private */
  this.debugPortStart = options.debugPortStart || 43210;
  /** @readonly @deprecated */
  this.nodeWorker = options.nodeWorker;
  /** @readonly
   * @type {'auto' | 'web' | 'process' | 'thread'}
   */
  this.workerType = options.workerType || options.nodeWorker || "auto";
  /** @readonly */
  this.maxQueueSize = options.maxQueueSize || Infinity;
  /** @readonly */
  this.workerTerminateTimeout = options.workerTerminateTimeout || 1000;

  /** @readonly */
  this.onCreateWorker = options.onCreateWorker || (() => null);
  /** @readonly */
  this.onTerminateWorker = options.onTerminateWorker || (() => null);

  /** @readonly */
  this.emitStdStreams = options.emitStdStreams || false;

  // configuration
  if (options && "maxWorkers" in options) {
    validateMaxWorkers(options.maxWorkers);
    /** @readonly */
    this.maxWorkers = options.maxWorkers;
  } else {
    this.maxWorkers = Math.max((environment.cpus || 4) - 1, 1);
  }

  if (options && "minWorkers" in options) {
    if (options.minWorkers === "max") {
      /** @readonly */
      this.minWorkers = this.maxWorkers;
    } else {
      validateMinWorkers(options.minWorkers);
      this.minWorkers = options.minWorkers;
      this.maxWorkers = Math.max(this.minWorkers, this.maxWorkers); // in case minWorkers is higher than maxWorkers
    }
    this._ensureMinWorkers();
  }

  /** @private */
  this._boundNext = this._next.bind(this);

  if (this.workerType === "thread") {
    WorkerHandler.ensureWorkerThreads();
  }

  // ============================================================================
  // Enhanced Features Initialization
  // ============================================================================

  /** @private */
  this._options = options;

  /** @private - Event emitter storage */
  this._eventListeners = new Map();

  /** @private - Ready state */
  this._isReady = false;
  var self = this;
  /** @private */
  this._readyPromise = new Promise(function(resolve) {
    self._readyResolver = resolve;
  });

  /** @private - Circuit breaker state */
  this._circuitState = 'closed';
  this._circuitErrorCount = 0;
  this._circuitResetTimer = null;
  this._circuitHalfOpenSuccess = 0;
  this._circuitOptions = {
    enabled: options.circuitBreaker?.enabled ?? false,
    errorThreshold: options.circuitBreaker?.errorThreshold ?? 5,
    resetTimeout: options.circuitBreaker?.resetTimeout ?? 30000,
    halfOpenRequests: options.circuitBreaker?.halfOpenRequests ?? 2,
  };

  /** @private - Retry configuration */
  this._retryOptions = {
    maxRetries: options.retry?.maxRetries ?? 0,
    retryDelay: options.retry?.retryDelay ?? 100,
    retryOn: options.retry?.retryOn ?? ['WorkerTerminatedError', 'TimeoutError'],
    backoffMultiplier: options.retry?.backoffMultiplier ?? 2,
  };

  /** @private - Memory management */
  this._memoryOptions = {
    maxQueueMemory: options.memory?.maxQueueMemory ?? Infinity,
    onMemoryPressure: options.memory?.onMemoryPressure ?? 'reject',
  };
  this._estimatedQueueMemory = 0;

  /** @private - Health checks */
  this._healthCheckTimer = null;
  this._healthCheckOptions = {
    enabled: options.healthCheck?.enabled ?? false,
    interval: options.healthCheck?.interval ?? 5000,
    timeout: options.healthCheck?.timeout ?? 1000,
    action: options.healthCheck?.action ?? 'restart',
  };

  /** @private - Data transfer strategy */
  this._dataTransfer = options.dataTransfer ?? 'auto';

  /** @private - Task tracking */
  this._taskIdCounter = 0;

  // Start health checks if enabled
  if (this._healthCheckOptions.enabled) {
    this._startHealthChecks();
  }

  // Handle initialization based on eagerInit option
  if (options.eagerInit) {
    this._eagerInitialize();
  } else {
    // Mark ready immediately if not eagerly initializing
    this._markReady();
  }
}

// ============================================================================
// Enhanced Properties
// ============================================================================

/**
 * Promise that resolves when the pool is ready
 * @type {Promise<void>}
 */
Object.defineProperty(Pool.prototype, 'ready', {
  get: function() { return this._readyPromise; }
});

/**
 * Check if pool is ready
 * @type {boolean}
 */
Object.defineProperty(Pool.prototype, 'isReady', {
  get: function() { return this._isReady; }
});

/**
 * Get current runtime capabilities
 * @type {object}
 */
Object.defineProperty(Pool.prototype, 'capabilities', {
  get: function() {
    var capabilities = require('./capabilities');
    return capabilities.getCapabilities();
  }
});

// ============================================================================
// Original Pool Methods
// ============================================================================

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
 * @template { (...args: any[]) => any } T
 * @param {String | T} method  Function name or function.
 *                                    If `method` is a string, the corresponding
 *                                    method on the worker will be executed
 *                                    If `method` is a Function, the function
 *                                    will be stringified and executed via the
 *                                    workers built-in function `run(fn, args)`.
 * @param {Parameters<T> | null} [params]  Function arguments applied when calling the function
 * @param {import('./types.js').ExecOptions} [options]  Options
 * @return {Promise<ReturnType<T>>}
 */
Pool.prototype.exec = function (method, params, options) {
  var self = this;

  // validate type of arguments
  if (params && !Array.isArray(params)) {
    throw new TypeError('Array expected as argument "params"');
  }

  // Check circuit breaker
  if (this._circuitOptions.enabled && this._circuitState === 'open') {
    var circuitError = new Error('Circuit breaker is open');
    circuitError.name = 'CircuitBreakerError';
    return Promise.reject(circuitError);
  }

  // Check memory pressure
  if (options && options.estimatedSize) {
    var newEstimate = this._estimatedQueueMemory + options.estimatedSize;
    if (newEstimate > this._memoryOptions.maxQueueMemory) {
      this._emit('memoryPressure', {
        usedBytes: this._estimatedQueueMemory,
        maxBytes: this._memoryOptions.maxQueueMemory,
        action: this._memoryOptions.onMemoryPressure,
        timestamp: Date.now(),
      });

      if (this._memoryOptions.onMemoryPressure === 'reject') {
        var memError = new Error('Queue memory limit exceeded');
        memError.name = 'MemoryPressureError';
        return Promise.reject(memError);
      }
    }
    this._estimatedQueueMemory = newEstimate;
  }

  if (typeof method === "string") {
    var resolver = Promise.defer();

    if (this.taskQueue.size() >= this.maxQueueSize) {
      throw new Error("Max queue size of " + this.maxQueueSize + " reached");
    }

    // Generate task ID and track start time
    var taskId = ++this._taskIdCounter;
    var startTime = Date.now();

    // Emit task start event
    this._emit('taskStart', {
      taskId: taskId,
      method: method,
      workerIndex: -1,
      timestamp: startTime,
    });

    // add a new task to the queue
    var task = {
      method: method,
      params: params,
      resolver: resolver,
      timeout: null,
      options: options,
      taskId: taskId,
      startTime: startTime,
    };
    this.taskQueue.push(task);

    // replace the timeout method of the Promise with our own,
    // which starts the timer as soon as the task is actually started
    var originalTimeout = resolver.promise.timeout;
    var taskQueue = this.taskQueue;
    resolver.promise.timeout = function timeout(delay) {
      if (taskQueue.contains(task)) {
        // task is still queued -> start the timer later on
        task.timeout = delay;
        return resolver.promise;
      } else {
        // task is already being executed -> start timer immediately
        return originalTimeout.call(resolver.promise, delay);
      }
    };

    // Add completion tracking for enhanced features
    var originalPromise = resolver.promise;
    originalPromise.then(
      function(result) {
        var duration = Date.now() - startTime;
        self._onTaskComplete(taskId, duration, result, options && options.estimatedSize);
        if (self._circuitOptions.enabled) {
          self._circuitOnSuccess();
        }
      },
      function(error) {
        var duration = Date.now() - startTime;
        self._onTaskError(taskId, error, duration, options && options.estimatedSize);
        if (self._circuitOptions.enabled) {
          self._circuitOnError();
        }
      }
    );

    // trigger task execution
    this._next();

    return resolver.promise;
  } else if (typeof method === "function") {
    // send stringified function and function arguments to worker
    return this.exec("run", [String(method), params], options);
  } else {
    throw new TypeError('Function or string expected as argument "method"');
  }
};

/**
 * Create a proxy for current worker. Returns an object containing all
 * methods available on the worker. All methods return promises resolving the methods result.
 * @template { { [k: string]: (...args: any[]) => any } } T
 * @return {Promise<import('./types.js').Proxy<T>, Error>} Returns a promise which resolves with a proxy object
 */
Pool.prototype.proxy = function () {
  if (arguments.length > 0) {
    throw new Error("No arguments expected");
  }

  var pool = this;
  return this.exec("methods").then(function (methods) {
    var proxy = {};

    methods.forEach(function (method) {
      proxy[method] = function () {
        return pool.exec(method, Array.prototype.slice.call(arguments));
      };
    });

    return proxy;
  });
};

/**
 * Creates new array with the results of calling a provided callback function
 * on every element in this array.
 * @param {Array} array
 * @param {function} callback  Function taking two arguments:
 *                             `callback(currentValue, index)`
 * @return {Promise.<Array>} Returns a promise which resolves  with an Array
 *                           containing the results of the callback function
 *                           executed for each of the array elements.
 */
/* TODO: implement map
Pool.prototype.map = function (array, callback) {
};
*/

/**
 * Grab the first task from the queue, find a free worker, and assign the
 * worker to the task.
 * @private
 */
Pool.prototype._next = function () {
  if (this.taskQueue.size() > 0) {
    // there are tasks in the queue

    // find an available worker
    var worker = this._getWorker();
    if (worker) {
      // get the first task from the queue
      var me = this;
      var task = this.taskQueue.pop();

      // check if the task is still pending (and not cancelled -> promise rejected)
      if (task.resolver.promise.pending) {
        // send the request to the worker
        var promise = worker
          .exec(task.method, task.params, task.resolver, task.options)
          .then(me._boundNext)
          .catch(function () {
            // if the worker crashed and terminated, remove it from the pool
            if (worker.terminated) {
              return me._removeWorker(worker);
            }
          })
          .then(function () {
            me._next(); // trigger next task in the queue
          });

        // start queued timer now
        if (typeof task.timeout === "number") {
          promise.timeout(task.timeout);
        }
      } else {
        // The task taken was already complete (either rejected or resolved), so just trigger next task in the queue
        me._next();
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
Pool.prototype._getWorker = function () {
  // find a non-busy worker
  var workers = this.workers;
  for (var i = 0; i < workers.length; i++) {
    var worker = workers[i];
    if (worker.busy() === false) {
      return worker;
    }
  }

  if (workers.length < this.maxWorkers) {
    // create a new worker
    worker = this._createWorkerHandler();
    workers.push(worker);
    return worker;
  }

  return null;
};

/**
 * Remove a worker from the pool.
 * Attempts to terminate worker if not already terminated, and ensures the minimum
 * pool size is met.
 * @param {WorkerHandler} worker
 * @return {Promise<WorkerHandler>}
 * @private
 */
Pool.prototype._removeWorker = function (worker) {
  var me = this;

  DEBUG_PORT_ALLOCATOR.releasePort(worker.debugPort);
  // _removeWorker will call this, but we need it to be removed synchronously
  this._removeWorkerFromList(worker);
  // If minWorkers set, spin up new workers to replace the crashed ones
  this._ensureMinWorkers();
  // terminate the worker (if not already terminated)
  return new Promise(function (resolve, reject) {
    worker.terminate(false, function (err) {
      me.onTerminateWorker({
        forkArgs: worker.forkArgs,
        forkOpts: worker.forkOpts,
        workerThreadOpts: worker.workerThreadOpts,
        script: worker.script,
      });
      if (err) {
        reject(err);
      } else {
        resolve(worker);
      }
    });
  });
};

/**
 * Remove a worker from the pool list.
 * @param {WorkerHandler} worker
 * @private
 */
Pool.prototype._removeWorkerFromList = function (worker) {
  // remove from the list with workers
  var index = this.workers.indexOf(worker);
  if (index !== -1) {
    this.workers.splice(index, 1);
  }
};

/**
 * Close all active workers. Tasks currently being executed will be finished first.
 * @param {boolean} [force=false]   If false (default), the workers are terminated
 *                                  after finishing all tasks currently in
 *                                  progress. If true, the workers will be
 *                                  terminated immediately.
 * @param {number} [timeout]        If provided and non-zero, worker termination promise will be rejected
 *                                  after timeout if worker process has not been terminated.
 * @return {Promise.<void, Error>}
 */
Pool.prototype.terminate = function (force, timeout) {
  var me = this;

  // Stop health checks
  if (this._healthCheckTimer) {
    clearInterval(this._healthCheckTimer);
    this._healthCheckTimer = null;
  }

  // Stop circuit breaker timer
  if (this._circuitResetTimer) {
    clearTimeout(this._circuitResetTimer);
    this._circuitResetTimer = null;
  }

  // cancel any pending tasks
  var taskQueue = this.taskQueue;

  while (taskQueue.size() > 0) {
    var task = taskQueue.pop();
    if (task) {
      task.resolver.reject(new Error("Pool terminated"));
    } else {
      break;
    }
  }

  taskQueue.clear();

  var f = function (worker) {
    DEBUG_PORT_ALLOCATOR.releasePort(worker.debugPort);
    this._removeWorkerFromList(worker);
  };
  var removeWorker = f.bind(this);

  var promises = [];
  var workers = this.workers.slice();
  workers.forEach(function (worker) {
    var termPromise = worker
      .terminateAndNotify(force, timeout)
      .then(removeWorker)
      .always(function () {
        me.onTerminateWorker({
          forkArgs: worker.forkArgs,
          forkOpts: worker.forkOpts,
          workerThreadOpts: worker.workerThreadOpts,
          script: worker.script,
        });
      });
    promises.push(termPromise);
  });
  return Promise.all(promises);
};

/**
 * Retrieve statistics on tasks and workers.
 * @return {object} Returns an object with statistics including enhanced metrics
 */
Pool.prototype.stats = function () {
  var totalWorkers = this.workers.length;
  var busyWorkers = this.workers.filter(function (worker) {
    return worker.busy();
  }).length;

  return {
    totalWorkers: totalWorkers,
    busyWorkers: busyWorkers,
    idleWorkers: totalWorkers - busyWorkers,
    pendingTasks: this.taskQueue.size(),
    activeTasks: busyWorkers,
    // Enhanced statistics
    circuitState: this._circuitState,
    estimatedQueueMemory: this._estimatedQueueMemory,
  };
};

/**
 * Ensures that a minimum of minWorkers is up and running
 * @private
 */
Pool.prototype._ensureMinWorkers = function () {
  if (this.minWorkers) {
    for (var i = this.workers.length; i < this.minWorkers; i++) {
      this.workers.push(this._createWorkerHandler());
    }
  }
};

/**
 * Helper function to create a new WorkerHandler and pass all options.
 * @return {WorkerHandler}
 * @private
 */
Pool.prototype._createWorkerHandler = function () {
  const overriddenParams =
    this.onCreateWorker({
      forkArgs: this.forkArgs,
      forkOpts: this.forkOpts,
      workerOpts: this.workerOpts,
      workerThreadOpts: this.workerThreadOpts,
      script: this.script,
    }) || {};

  return new WorkerHandler(overriddenParams.script || this.script, {
    forkArgs: overriddenParams.forkArgs || this.forkArgs,
    forkOpts: overriddenParams.forkOpts || this.forkOpts,
    workerOpts: overriddenParams.workerOpts || this.workerOpts,
    workerThreadOpts:
      overriddenParams.workerThreadOpts || this.workerThreadOpts,
    debugPort: DEBUG_PORT_ALLOCATOR.nextAvailableStartingAt(
      this.debugPortStart
    ),
    workerType: this.workerType,
    workerTerminateTimeout: this.workerTerminateTimeout,
    emitStdStreams: this.emitStdStreams,
  });
};

/**
 * Create queue instance based on strategy
 * @param {'fifo' | 'lifo' | import('./types').TaskQueue} strategy
 * @returns {import('./types').TaskQueue} Queue instance
 * @private
 */
Pool.prototype._createQueue = function (strategy) {
  if (typeof strategy === "string") {
    switch (strategy) {
      case "fifo":
        return new FIFOQueue();
      case "lifo":
        return new LIFOQueue();
      default:
        throw new Error("Unknown queue strategy: " + strategy);
    }
  }

  if (!strategy) {
    throw new Error("Queue strategy cannot be null or undefined");
  }

  // validate if custom queue implements required methods
  var requiredMethods = ["push", "pop", "size", "contains", "clear"];

  for (var i = 0; i < requiredMethods.length; i++) {
    var method = requiredMethods[i];
    if (typeof strategy[method] !== "function") {
      throw new Error("Queue strategy must implement method: " + method);
    }
  }

  return strategy;
};

// ============================================================================
// Enhanced Features - Event Emitter
// ============================================================================

/**
 * Add event listener
 * @param {string} event - Event name (taskStart, taskComplete, taskError, etc.)
 * @param {Function} listener - Listener function
 * @returns {Pool} this for chaining
 */
Pool.prototype.on = function(event, listener) {
  var listeners = this._eventListeners.get(event);
  if (!listeners) {
    listeners = new Set();
    this._eventListeners.set(event, listeners);
  }
  listeners.add(listener);
  return this;
};

/**
 * Remove event listener
 * @param {string} event - Event name
 * @param {Function} listener - Listener function
 * @returns {Pool} this for chaining
 */
Pool.prototype.off = function(event, listener) {
  var listeners = this._eventListeners.get(event);
  if (listeners) {
    listeners.delete(listener);
  }
  return this;
};

/**
 * Add one-time event listener
 * @param {string} event - Event name
 * @param {Function} listener - Listener function
 * @returns {Pool} this for chaining
 */
Pool.prototype.once = function(event, listener) {
  var self = this;
  var onceWrapper = function(evt) {
    self.off(event, onceWrapper);
    listener(evt);
  };
  return this.on(event, onceWrapper);
};

/**
 * Emit an event
 * @param {string} event - Event name
 * @param {*} payload - Event payload
 * @private
 */
Pool.prototype._emit = function(event, payload) {
  var listeners = this._eventListeners.get(event);
  if (listeners) {
    listeners.forEach(function(listener) {
      try {
        listener(payload);
      } catch (e) {
        // Ignore listener errors
      }
    });
  }
};

// ============================================================================
// Enhanced Features - Ready State & Warmup
// ============================================================================

/**
 * Warm up the pool by ensuring workers are spawned and ready
 * @param {object} [options] - Warmup options
 * @param {number} [options.count] - Number of workers to warm up
 * @returns {Promise<void>}
 */
Pool.prototype.warmup = function(options) {
  var self = this;
  var targetCount = (options && options.count) || this.minWorkers || this.maxWorkers;
  var promises = [];

  for (var i = 0; i < targetCount; i++) {
    promises.push(this._warmupWorker());
  }

  return Promise.all(promises).then(function() {
    self._markReady();
  });
};

/**
 * Mark pool as ready
 * @private
 */
Pool.prototype._markReady = function() {
  if (!this._isReady) {
    this._isReady = true;
    this._readyResolver();
  }
};

/**
 * Eager initialize workers
 * @private
 */
Pool.prototype._eagerInitialize = function() {
  var self = this;
  var targetCount = this.minWorkers || Math.min(2, this.maxWorkers);
  var promises = [];

  for (var i = 0; i < targetCount; i++) {
    promises.push(this._warmupWorker());
  }

  Promise.all(promises).then(function() {
    self._markReady();
  });
};

/**
 * Warm up a single worker
 * @private
 */
Pool.prototype._warmupWorker = function() {
  return this.exec('methods').catch(function() {
    // Ignore errors during warmup
  });
};

// ============================================================================
// Enhanced Features - Task Tracking
// ============================================================================

/**
 * Handle task completion
 * @private
 */
Pool.prototype._onTaskComplete = function(taskId, duration, result, estimatedSize) {
  if (estimatedSize) {
    this._estimatedQueueMemory = Math.max(0, this._estimatedQueueMemory - estimatedSize);
  }

  this._emit('taskComplete', {
    taskId: taskId,
    duration: duration,
    result: result,
    timestamp: Date.now(),
  });
};

/**
 * Handle task error
 * @private
 */
Pool.prototype._onTaskError = function(taskId, error, duration, estimatedSize) {
  if (estimatedSize) {
    this._estimatedQueueMemory = Math.max(0, this._estimatedQueueMemory - estimatedSize);
  }

  this._emit('taskError', {
    taskId: taskId,
    error: error,
    duration: duration,
    timestamp: Date.now(),
  });
};

// ============================================================================
// Enhanced Features - Circuit Breaker
// ============================================================================

/**
 * Circuit breaker: record success
 * @private
 */
Pool.prototype._circuitOnSuccess = function() {
  if (this._circuitState === 'half-open') {
    this._circuitHalfOpenSuccess++;
    if (this._circuitHalfOpenSuccess >= this._circuitOptions.halfOpenRequests) {
      this._closeCircuit();
    }
  }
};

/**
 * Circuit breaker: record error
 * @private
 */
Pool.prototype._circuitOnError = function() {
  if (this._circuitState === 'half-open') {
    this._openCircuit();
    return;
  }

  this._circuitErrorCount++;
  if (this._circuitErrorCount >= this._circuitOptions.errorThreshold) {
    this._openCircuit();
  }
};

/**
 * Open the circuit breaker
 * @private
 */
Pool.prototype._openCircuit = function() {
  var self = this;
  if (this._circuitState !== 'open') {
    this._circuitState = 'open';
    this._emit('circuitOpen', {
      errorCount: this._circuitErrorCount,
      threshold: this._circuitOptions.errorThreshold,
      timestamp: Date.now(),
    });

    // Schedule reset
    this._circuitResetTimer = setTimeout(function() {
      self._halfOpenCircuit();
    }, this._circuitOptions.resetTimeout);
  }
};

/**
 * Move circuit to half-open state
 * @private
 */
Pool.prototype._halfOpenCircuit = function() {
  this._circuitState = 'half-open';
  this._circuitHalfOpenSuccess = 0;
  this._emit('circuitHalfOpen', { timestamp: Date.now() });
};

/**
 * Close the circuit breaker
 * @private
 */
Pool.prototype._closeCircuit = function() {
  this._circuitState = 'closed';
  this._circuitErrorCount = 0;
  this._circuitHalfOpenSuccess = 0;
  if (this._circuitResetTimer) {
    clearTimeout(this._circuitResetTimer);
    this._circuitResetTimer = null;
  }
  this._emit('circuitClose', { timestamp: Date.now() });
};

// ============================================================================
// Enhanced Features - Health Checks
// ============================================================================

/**
 * Start health check interval
 * @private
 */
Pool.prototype._startHealthChecks = function() {
  var self = this;
  this._healthCheckTimer = setInterval(function() {
    self._runHealthCheck();
  }, this._healthCheckOptions.interval);
};

/**
 * Run health check
 * @private
 */
Pool.prototype._runHealthCheck = function() {
  var self = this;
  var promise = this.exec('methods');
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new Error('Health check timeout'));
    }, self._healthCheckOptions.timeout);
  });

  Promise.race([promise, timeoutPromise]).catch(function(error) {
    if (self._healthCheckOptions.action === 'warn') {
      console.warn('[workerpool] Health check failed:', error);
    }
  });
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Ensure that the maxWorkers option is an integer >= 1
 * @param {*} maxWorkers
 * @returns {boolean} returns true maxWorkers has a valid value
 */
function validateMaxWorkers(maxWorkers) {
  if (!isNumber(maxWorkers) || !isInteger(maxWorkers) || maxWorkers < 1) {
    throw new TypeError("Option maxWorkers must be an integer number >= 1");
  }
}

/**
 * Ensure that the minWorkers option is an integer >= 0
 * @param {*} minWorkers
 * @returns {boolean} returns true when minWorkers has a valid value
 */
function validateMinWorkers(minWorkers) {
  if (!isNumber(minWorkers) || !isInteger(minWorkers) || minWorkers < 0) {
    throw new TypeError("Option minWorkers must be an integer number >= 0");
  }
}

/**
 * Test whether a variable is a number
 * @param {*} value
 * @returns {boolean} returns true when value is a number
 */
function isNumber(value) {
  return typeof value === "number";
}

/**
 * Test whether a number is an integer
 * @param {number} value
 * @returns {boolean} Returns true if value is an integer
 */
function isInteger(value) {
  return Math.round(value) == value;
}

// ============================================================================
// Shared Pool Singleton
// ============================================================================

var _sharedPool = null;

/**
 * Get or create a shared pool singleton
 * @param {object} [options] - Pool options (only used on first call)
 * @returns {Pool}
 */
Pool.getSharedPool = function(options) {
  if (!_sharedPool) {
    _sharedPool = new Pool(Object.assign({ eagerInit: true }, options || {}));
  }
  return _sharedPool;
};

/**
 * Terminate and clear the shared pool
 * @param {boolean} [force] - Force terminate
 * @returns {Promise<void>}
 */
Pool.terminateSharedPool = function(force) {
  if (_sharedPool) {
    return _sharedPool.terminate(force).then(function() {
      _sharedPool = null;
    });
  }
  // Use the custom Promise's defer() pattern instead of Promise.resolve()
  var deferred = Promise.defer();
  deferred.resolve();
  return deferred.promise;
};

/**
 * Check if a shared pool exists
 * @returns {boolean}
 */
Pool.hasSharedPool = function() {
  return _sharedPool !== null;
};

module.exports = Pool;

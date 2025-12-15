/**
 * PoolEnhanced - Enhanced worker pool with advanced features
 *
 * Wraps the base Pool with:
 * - pool.ready promise for eager initialization
 * - pool.warmup() method for pre-spawning workers
 * - Event emitter for monitoring (taskStart, taskComplete, taskError, etc.)
 * - Automatic data transfer strategy selection
 * - Automatic task retry
 * - Circuit breaker pattern
 * - Memory-aware scheduling
 */

var Pool = require('./Pool');

// ============================================================================
// PoolEnhanced Implementation
// ============================================================================

/**
 * Enhanced worker pool with advanced features
 * @param {string|object} [script] - Worker script path or options
 * @param {object} [options] - Pool options
 */
function PoolEnhanced(script, options) {
  // Handle overloaded constructor
  var effectiveScript;
  var effectiveOptions;

  if (typeof script === 'string') {
    effectiveScript = script;
    effectiveOptions = options || {};
  } else {
    effectiveScript = undefined;
    effectiveOptions = script || {};
  }

  // Create internal pool
  this._pool = effectiveScript
    ? new Pool(effectiveScript, effectiveOptions)
    : new Pool(effectiveOptions);

  this._options = effectiveOptions;

  // Event emitter
  this._eventListeners = new Map();

  // Ready state
  this._isReady = false;
  var self = this;
  this._readyPromise = new Promise(function(resolve) {
    self._readyResolver = resolve;
  });

  // Circuit breaker
  this._circuitState = 'closed';
  this._circuitErrorCount = 0;
  this._circuitResetTimer = null;
  this._circuitHalfOpenSuccess = 0;
  this._circuitOptions = {
    enabled: effectiveOptions.circuitBreaker?.enabled ?? false,
    errorThreshold: effectiveOptions.circuitBreaker?.errorThreshold ?? 5,
    resetTimeout: effectiveOptions.circuitBreaker?.resetTimeout ?? 30000,
    halfOpenRequests: effectiveOptions.circuitBreaker?.halfOpenRequests ?? 2,
  };

  // Retry configuration
  this._retryOptions = {
    maxRetries: effectiveOptions.retry?.maxRetries ?? 0,
    retryDelay: effectiveOptions.retry?.retryDelay ?? 100,
    retryOn: effectiveOptions.retry?.retryOn ?? ['WorkerTerminatedError', 'TimeoutError'],
    backoffMultiplier: effectiveOptions.retry?.backoffMultiplier ?? 2,
  };

  // Memory management
  this._memoryOptions = {
    maxQueueMemory: effectiveOptions.memory?.maxQueueMemory ?? Infinity,
    onMemoryPressure: effectiveOptions.memory?.onMemoryPressure ?? 'reject',
  };
  this._estimatedQueueMemory = 0;

  // Health checks
  this._healthCheckTimer = null;
  this._healthCheckOptions = {
    enabled: effectiveOptions.healthCheck?.enabled ?? false,
    interval: effectiveOptions.healthCheck?.interval ?? 5000,
    timeout: effectiveOptions.healthCheck?.timeout ?? 1000,
    action: effectiveOptions.healthCheck?.action ?? 'restart',
  };

  // Data transfer strategy
  this._dataTransfer = effectiveOptions.dataTransfer ?? 'auto';

  // Task tracking
  this._taskIdCounter = 0;

  // Start health checks if enabled
  if (this._healthCheckOptions.enabled) {
    this._startHealthChecks();
  }

  // Eager init if requested
  if (effectiveOptions.eagerInit) {
    this._eagerInitialize();
  } else {
    // Mark ready immediately if not eagerly initializing
    this._markReady();
  }
}

// ============================================================================
// Public Properties
// ============================================================================

Object.defineProperty(PoolEnhanced.prototype, 'script', {
  get: function() { return this._pool.script; }
});

Object.defineProperty(PoolEnhanced.prototype, 'maxWorkers', {
  get: function() { return this._pool.maxWorkers; }
});

Object.defineProperty(PoolEnhanced.prototype, 'minWorkers', {
  get: function() { return this._pool.minWorkers ?? 0; }
});

Object.defineProperty(PoolEnhanced.prototype, 'ready', {
  get: function() { return this._readyPromise; }
});

Object.defineProperty(PoolEnhanced.prototype, 'isReady', {
  get: function() { return this._isReady; }
});

Object.defineProperty(PoolEnhanced.prototype, 'capabilities', {
  get: function() {
    var capabilities = require('./capabilities');
    return capabilities.getCapabilities();
  }
});

// ============================================================================
// Public Methods
// ============================================================================

/**
 * Warm up the pool by ensuring workers are spawned and ready
 * @param {object} [options] - Warmup options
 * @param {number} [options.count] - Number of workers to warm up
 * @returns {Promise<void>}
 */
PoolEnhanced.prototype.warmup = function(options) {
  var self = this;
  var targetCount = options?.count ?? this.minWorkers ?? this.maxWorkers;
  var promises = [];

  for (var i = 0; i < targetCount; i++) {
    promises.push(this._warmupWorker());
  }

  return Promise.all(promises).then(function() {
    self._markReady();
  });
};

/**
 * Execute a method with enhanced features
 * @param {string|Function} method - Method to execute
 * @param {Array} [params] - Parameters
 * @param {object} [options] - Execution options
 * @returns {Promise}
 */
PoolEnhanced.prototype.exec = function(method, params, options) {
  var self = this;

  // Check circuit breaker
  if (this._circuitOptions.enabled && this._circuitState === 'open') {
    var error = new Error('Circuit breaker is open');
    error.name = 'CircuitBreakerError';
    return Promise.reject(error);
  }

  // Check memory pressure
  if (options?.estimatedSize) {
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

  // Apply data transfer strategy
  var effectiveOptions = this._applyDataTransferStrategy(params, options);

  // Generate task ID
  var taskId = ++this._taskIdCounter;
  var startTime = Date.now();

  // Emit task start event
  this._emit('taskStart', {
    taskId: taskId,
    method: typeof method === 'string' ? method : 'run',
    workerIndex: -1,
    timestamp: startTime,
  });

  // Execute with retry support
  var executeWithRetry = function(attempt) {
    var promise = self._pool.exec(method, params, effectiveOptions);

    // Add completion handlers
    promise.then(
      function(result) {
        var duration = Date.now() - startTime;
        self._onTaskComplete(taskId, duration, result, options?.estimatedSize);
        if (self._circuitOptions.enabled) {
          self._circuitOnSuccess();
        }
      },
      function(error) {
        var duration = Date.now() - startTime;

        // Check if we should retry
        var retryOptions = options?.retry === false
          ? null
          : Object.assign({}, self._retryOptions, options?.retry || {});

        var shouldRetry = retryOptions &&
          attempt < retryOptions.maxRetries &&
          self._shouldRetryError(error, retryOptions.retryOn);

        if (shouldRetry) {
          self._emit('retry', {
            taskId: taskId,
            attempt: attempt + 1,
            maxRetries: retryOptions.maxRetries,
            error: error,
            timestamp: Date.now(),
          });

          // Calculate backoff delay
          var delay = retryOptions.retryDelay *
            Math.pow(retryOptions.backoffMultiplier, attempt);

          setTimeout(function() {
            executeWithRetry(attempt + 1);
          }, delay);
        } else {
          self._onTaskError(taskId, error, duration, options?.estimatedSize);
          if (self._circuitOptions.enabled) {
            self._circuitOnError();
          }
        }
      }
    );

    return promise;
  };

  return executeWithRetry(0);
};

/**
 * Get a proxy to the worker
 * @returns {Promise}
 */
PoolEnhanced.prototype.proxy = function() {
  return this._pool.proxy();
};

/**
 * Get enhanced statistics
 * @returns {object}
 */
PoolEnhanced.prototype.stats = function() {
  var baseStats = this._pool.stats();
  return Object.assign({}, baseStats, {
    circuitState: this._circuitState,
    estimatedQueueMemory: this._estimatedQueueMemory,
  });
};

/**
 * Add event listener
 * @param {string} event - Event name
 * @param {Function} listener - Listener function
 * @returns {PoolEnhanced}
 */
PoolEnhanced.prototype.on = function(event, listener) {
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
 * @returns {PoolEnhanced}
 */
PoolEnhanced.prototype.off = function(event, listener) {
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
 * @returns {PoolEnhanced}
 */
PoolEnhanced.prototype.once = function(event, listener) {
  var self = this;
  var onceWrapper = function(evt) {
    self.off(event, onceWrapper);
    listener(evt);
  };
  return this.on(event, onceWrapper);
};

/**
 * Terminate pool with cleanup
 * @param {boolean} [force] - Force terminate
 * @param {number} [timeout] - Termination timeout
 * @returns {Promise}
 */
PoolEnhanced.prototype.terminate = function(force, timeout) {
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

  return this._pool.terminate(force, timeout);
};

// ============================================================================
// Private Methods
// ============================================================================

/**
 * Emit an event
 * @private
 */
PoolEnhanced.prototype._emit = function(event, payload) {
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

/**
 * Mark pool as ready
 * @private
 */
PoolEnhanced.prototype._markReady = function() {
  if (!this._isReady) {
    this._isReady = true;
    this._readyResolver();
  }
};

/**
 * Eager initialize workers
 * @private
 */
PoolEnhanced.prototype._eagerInitialize = function() {
  var self = this;
  var targetCount = this.minWorkers ?? Math.min(2, this.maxWorkers);
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
PoolEnhanced.prototype._warmupWorker = function() {
  return this.exec('methods').catch(function() {
    // Ignore errors during warmup
  });
};

/**
 * Apply data transfer strategy
 * @private
 */
PoolEnhanced.prototype._applyDataTransferStrategy = function(params, options) {
  var strategy = options?.dataTransfer ?? this._dataTransfer;
  var effectiveOptions = Object.assign({}, options);

  if (strategy === 'json' || !params || params.length === 0) {
    return effectiveOptions;
  }

  // For auto strategy, let the base pool handle it
  return effectiveOptions;
};

/**
 * Handle task completion
 * @private
 */
PoolEnhanced.prototype._onTaskComplete = function(taskId, duration, result, estimatedSize) {
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
PoolEnhanced.prototype._onTaskError = function(taskId, error, duration, estimatedSize) {
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

/**
 * Check if error should trigger retry
 * @private
 */
PoolEnhanced.prototype._shouldRetryError = function(error, retryOn) {
  return retryOn.includes(error.name) || retryOn.includes(error.constructor.name);
};

/**
 * Circuit breaker: record success
 * @private
 */
PoolEnhanced.prototype._circuitOnSuccess = function() {
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
PoolEnhanced.prototype._circuitOnError = function() {
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
PoolEnhanced.prototype._openCircuit = function() {
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
PoolEnhanced.prototype._halfOpenCircuit = function() {
  this._circuitState = 'half-open';
  this._circuitHalfOpenSuccess = 0;
  this._emit('circuitHalfOpen', { timestamp: Date.now() });
};

/**
 * Close the circuit breaker
 * @private
 */
PoolEnhanced.prototype._closeCircuit = function() {
  this._circuitState = 'closed';
  this._circuitErrorCount = 0;
  this._circuitHalfOpenSuccess = 0;
  if (this._circuitResetTimer) {
    clearTimeout(this._circuitResetTimer);
    this._circuitResetTimer = null;
  }
  this._emit('circuitClose', { timestamp: Date.now() });
};

/**
 * Start health check interval
 * @private
 */
PoolEnhanced.prototype._startHealthChecks = function() {
  var self = this;
  this._healthCheckTimer = setInterval(function() {
    self._runHealthCheck();
  }, this._healthCheckOptions.interval);
};

/**
 * Run health check
 * @private
 */
PoolEnhanced.prototype._runHealthCheck = function() {
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
// Shared Pool Singleton
// ============================================================================

var _sharedPool = null;

/**
 * Get or create a shared pool singleton
 * @param {object} [options] - Pool options (only used on first call)
 * @returns {PoolEnhanced}
 */
function getSharedPool(options) {
  if (!_sharedPool) {
    _sharedPool = new PoolEnhanced(Object.assign({ eagerInit: true }, options));
  }
  return _sharedPool;
}

/**
 * Terminate and clear the shared pool
 * @param {boolean} [force] - Force terminate
 * @returns {Promise<void>}
 */
function terminateSharedPool(force) {
  if (_sharedPool) {
    return _sharedPool.terminate(force).then(function() {
      _sharedPool = null;
    });
  }
  return Promise.resolve();
}

/**
 * Check if a shared pool exists
 * @returns {boolean}
 */
function hasSharedPool() {
  return _sharedPool !== null;
}

// ============================================================================
// Exports
// ============================================================================

exports.PoolEnhanced = PoolEnhanced;
exports.getSharedPool = getSharedPool;
exports.terminateSharedPool = terminateSharedPool;
exports.hasSharedPool = hasSharedPool;

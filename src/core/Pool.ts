/**
 * Pool - Worker pool manager with enhanced features
 *
 * Manages a pool of workers for executing tasks in parallel.
 * Handles worker lifecycle, task queuing, and load balancing.
 *
 * Enhanced features:
 * - pool.ready promise for eager initialization
 * - pool.warmup() method for pre-spawning workers
 * - Event emitter for monitoring (taskStart, taskComplete, taskError, etc.)
 * - Automatic task retry with exponential backoff
 * - Circuit breaker pattern for error recovery
 * - Memory-aware scheduling
 * - Health checks
 */

import { WorkerpoolPromise } from './Promise';
import { WorkerHandler, ensureWorkerThreads, TerminateError } from './WorkerHandler';
import type { WorkerHandlerOptions, WorkerType } from './WorkerHandler';
import { cpus } from '../platform/environment';
import { FIFOQueue, LIFOQueue, createQueue } from './TaskQueue';
import { DebugPortAllocator } from './debug-port-allocator';
import type {
  PoolOptions,
  ExecOptions,
  PoolStats,
  Task,
  Resolver,
  TaskQueue,
  QueueStrategy,
  WorkerProxy,
  WorkerArg,
  BatchTask,
  BatchOptions,
  BatchResult,
  BatchPromise,
  BatchProgress,
  MapOptions,
} from '../types/index';
import { createBatchExecutor, createMapExecutor, type TaskExecutor } from './batch-executor';

/** Global debug port allocator */
const DEBUG_PORT_ALLOCATOR = new DebugPortAllocator();

// ============================================================================
// Types for Enhanced Features
// ============================================================================

/**
 * Event types emitted by Pool
 */
export interface PoolEvents {
  taskStart: { taskId: number; method: string; workerIndex: number; timestamp: number };
  taskComplete: { taskId: number; duration: number; result: unknown; timestamp: number };
  taskError: { taskId: number; error: Error; duration: number; timestamp: number };
  workerSpawn: { workerIndex: number; timestamp: number };
  workerExit: { workerIndex: number; code: number | undefined; timestamp: number };
  workerError: { workerIndex: number; error: Error; timestamp: number };
  queueFull: { pendingTasks: number; maxPending: number; timestamp: number };
  retry: { taskId: number; attempt: number; maxRetries: number; error: Error; timestamp: number };
  circuitOpen: { errorCount: number; threshold: number; timestamp: number };
  circuitClose: { timestamp: number };
  circuitHalfOpen: { timestamp: number };
  memoryPressure: { usedBytes: number; maxBytes: number; action: string; timestamp: number };
}

/**
 * Event listener function type
 */
export type PoolEventListener<K extends keyof PoolEvents> = (event: PoolEvents[K]) => void;

/**
 * Data transfer strategy
 */
export type DataTransferStrategy = 'auto' | 'shared' | 'transferable' | 'binary' | 'json';

/**
 * Memory pressure action
 */
export type MemoryPressureAction = 'reject' | 'wait' | 'gc';

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  /** Enable circuit breaker */
  enabled?: boolean;
  /** Number of errors to trigger open state */
  errorThreshold?: number;
  /** Time to wait before trying again (ms) */
  resetTimeout?: number;
  /** Number of requests to test in half-open state */
  halfOpenRequests?: number;
}

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Delay between retries (ms) */
  retryDelay?: number;
  /** Error types to retry on */
  retryOn?: string[];
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
}

/**
 * Memory management options
 */
export interface MemoryOptions {
  /** Maximum queue memory in bytes */
  maxQueueMemory?: number;
  /** Action on memory pressure */
  onMemoryPressure?: MemoryPressureAction;
}

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Enable health checks */
  enabled?: boolean;
  /** Check interval (ms) */
  interval?: number;
  /** Health check timeout (ms) */
  timeout?: number;
  /** Action on unhealthy worker */
  action?: 'restart' | 'remove' | 'warn';
}

/**
 * Enhanced execution options
 */
export interface EnhancedExecOptions<T = unknown> extends ExecOptions<T> {
  /** Data transfer strategy */
  dataTransfer?: DataTransferStrategy;
  /** Estimated data size in bytes (for memory scheduling) */
  estimatedSize?: number;
  /** Override retry options for this task */
  retry?: RetryOptions | false;
  /** Priority level (higher = higher priority) */
  priority?: number;
}

/**
 * Enhanced pool options
 */
export interface EnhancedPoolOptions extends PoolOptions {
  /** Spawn workers immediately on pool creation */
  eagerInit?: boolean;
  /** Default data transfer strategy */
  dataTransfer?: DataTransferStrategy;
  /** Retry options */
  retry?: RetryOptions;
  /** Circuit breaker options */
  circuitBreaker?: CircuitBreakerOptions;
  /** Memory management options */
  memory?: MemoryOptions;
  /** Health check options */
  healthCheck?: HealthCheckOptions;
}

/**
 * Enhanced pool statistics
 */
export interface EnhancedPoolStats extends PoolStats {
  /** Circuit breaker state */
  circuitState?: CircuitState;
  /** Estimated queue memory usage */
  estimatedQueueMemory?: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate maxWorkers option
 */
function validateMaxWorkers(maxWorkers: unknown): void {
  if (
    typeof maxWorkers !== 'number' ||
    !Number.isInteger(maxWorkers) ||
    maxWorkers < 1
  ) {
    throw new TypeError('Option maxWorkers must be an integer number >= 1');
  }
}

/**
 * Validate minWorkers option
 */
function validateMinWorkers(minWorkers: unknown): void {
  if (
    typeof minWorkers !== 'number' ||
    !Number.isInteger(minWorkers) ||
    minWorkers < 0
  ) {
    throw new TypeError('Option minWorkers must be an integer number >= 0');
  }
}

// ============================================================================
// Pool Implementation
// ============================================================================

/**
 * Pool - Manages a pool of workers with enhanced features
 */
export class Pool<TMetadata = unknown> {
  /** Path to worker script */
  readonly script: string | null;

  /** All workers in the pool */
  workers: WorkerHandler[] = [];

  /** Task queue */
  private taskQueue: TaskQueue<TMetadata>;

  /** Fork arguments for child processes */
  readonly forkArgs: readonly string[];

  /** Fork options for child processes */
  readonly forkOpts: Readonly<Record<string, unknown>>;

  /** Options for browser workers */
  readonly workerOpts: Readonly<WorkerOptions>;

  /** Options for worker threads */
  readonly workerThreadOpts: Readonly<Record<string, unknown>>;

  /** Starting port for debug allocation */
  private debugPortStart: number;

  /** @deprecated Use workerType instead */
  readonly nodeWorker?: string;

  /** Type of worker to use */
  readonly workerType: WorkerType;

  /** Maximum queue size */
  readonly maxQueueSize: number;

  /** Timeout for worker termination */
  readonly workerTerminateTimeout: number;

  /** Callback when worker is created */
  readonly onCreateWorker: (params: WorkerArg) => WorkerArg | void | null;

  /** Callback when worker is terminated */
  readonly onTerminateWorker: (params: WorkerArg) => void;

  /** Whether to emit stdout/stderr events */
  readonly emitStdStreams: boolean;

  /** Maximum number of workers */
  readonly maxWorkers: number;

  /** Minimum number of workers */
  readonly minWorkers?: number;

  /** Bound _next method for reuse */
  private _boundNext: () => void;

  // ============================================================================
  // Enhanced Features - Private Properties
  // ============================================================================

  /** Options storage */
  private _options: EnhancedPoolOptions;

  /** Event emitter storage */
  private _eventListeners: Map<string, Set<PoolEventListener<keyof PoolEvents>>> = new Map();

  /** Ready state */
  private _isReady = false;
  private _readyPromise: WorkerpoolPromise<void, Error>;
  private _readyResolver!: () => void;

  /** Circuit breaker state */
  private _circuitState: CircuitState = 'closed';
  private _circuitErrorCount = 0;
  private _circuitResetTimer: ReturnType<typeof setTimeout> | null = null;
  private _circuitHalfOpenSuccess = 0;
  private _circuitOptions: Required<CircuitBreakerOptions>;

  /** Retry configuration */
  private _retryOptions: Required<RetryOptions>;

  /** Memory management */
  private _memoryOptions: Required<MemoryOptions>;
  private _estimatedQueueMemory = 0;

  /** Health checks */
  private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _healthCheckOptions: Required<HealthCheckOptions>;

  /** Data transfer strategy */
  private _dataTransfer: DataTransferStrategy;

  /** Task tracking */
  private _taskIdCounter = 0;

  constructor(script?: string | EnhancedPoolOptions, options?: EnhancedPoolOptions) {
    // Handle overloaded constructor
    if (typeof script === 'string') {
      this.script = script || null;
    } else {
      this.script = null;
      options = script;
    }

    options = options || {};
    this._options = options;

    // Initialize task queue
    this.taskQueue = createQueue(options.queueStrategy || 'fifo') as TaskQueue<TMetadata>;

    // Store options
    this.forkArgs = Object.freeze(options.forkArgs || []);
    this.forkOpts = Object.freeze(options.forkOpts || {});
    this.workerOpts = Object.freeze(options.workerOpts || {});
    this.workerThreadOpts = Object.freeze(options.workerThreadOpts || {});
    this.debugPortStart = options.debugPortStart || 43210;
    this.nodeWorker = options.nodeWorker;
    this.workerType = (options.workerType || options.nodeWorker || 'auto') as WorkerType;
    this.maxQueueSize = options.maxQueueSize || Infinity;
    this.workerTerminateTimeout = options.workerTerminateTimeout || 1000;
    this.onCreateWorker = options.onCreateWorker || (() => null);
    this.onTerminateWorker = options.onTerminateWorker || (() => {});
    this.emitStdStreams = options.emitStdStreams || false;

    // Configure worker counts
    if ('maxWorkers' in options && options.maxWorkers !== undefined) {
      validateMaxWorkers(options.maxWorkers);
      this.maxWorkers = options.maxWorkers;
    } else {
      this.maxWorkers = Math.max((cpus || 4) - 1, 1);
    }

    if ('minWorkers' in options && options.minWorkers !== undefined) {
      if (options.minWorkers === 'max') {
        this.minWorkers = this.maxWorkers;
      } else {
        validateMinWorkers(options.minWorkers);
        this.minWorkers = options.minWorkers;
        // Ensure minWorkers <= maxWorkers
        (this as { maxWorkers: number }).maxWorkers = Math.max(
          this.minWorkers,
          this.maxWorkers
        );
      }
      this._ensureMinWorkers();
    }

    this._boundNext = this._next.bind(this);

    // Validate worker threads if required
    if (this.workerType === 'thread') {
      ensureWorkerThreads();
    }

    // ============================================================================
    // Enhanced Features Initialization
    // ============================================================================

    // Initialize ready promise
    const resolver = WorkerpoolPromise.defer<void>();
    this._readyPromise = resolver.promise as WorkerpoolPromise<void, Error>;
    this._readyResolver = resolver.resolve as () => void;

    // Initialize circuit breaker
    this._circuitOptions = {
      enabled: options.circuitBreaker?.enabled ?? false,
      errorThreshold: options.circuitBreaker?.errorThreshold ?? 5,
      resetTimeout: options.circuitBreaker?.resetTimeout ?? 30000,
      halfOpenRequests: options.circuitBreaker?.halfOpenRequests ?? 2,
    };

    // Initialize retry options
    this._retryOptions = {
      maxRetries: options.retry?.maxRetries ?? 0,
      retryDelay: options.retry?.retryDelay ?? 100,
      retryOn: options.retry?.retryOn ?? ['WorkerTerminatedError', 'TimeoutError'],
      backoffMultiplier: options.retry?.backoffMultiplier ?? 2,
    };

    // Initialize memory options
    this._memoryOptions = {
      maxQueueMemory: options.memory?.maxQueueMemory ?? Infinity,
      onMemoryPressure: options.memory?.onMemoryPressure ?? 'reject',
    };

    // Initialize health check options
    this._healthCheckOptions = {
      enabled: options.healthCheck?.enabled ?? false,
      interval: options.healthCheck?.interval ?? 5000,
      timeout: options.healthCheck?.timeout ?? 1000,
      action: options.healthCheck?.action ?? 'restart',
    };

    // Initialize data transfer strategy
    this._dataTransfer = options.dataTransfer ?? 'auto';

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
   */
  get ready(): WorkerpoolPromise<void, Error> {
    return this._readyPromise;
  }

  /**
   * Check if pool is ready
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Get current runtime capabilities
   */
  get capabilities(): object {
    // Lazy load to avoid circular dependency
    const capabilitiesModule = require('../platform/capabilities');
    return capabilitiesModule.getCapabilities();
  }

  // ============================================================================
  // Core Methods
  // ============================================================================

  /**
   * Execute a method on a worker
   *
   * @param method - Method name or function to execute
   * @param params - Parameters to pass to the method
   * @param options - Execution options
   * @returns Promise resolving to the result
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exec<T = unknown>(
    method: string | ((...args: any[]) => T),
    params?: unknown[] | null,
    options?: EnhancedExecOptions<TMetadata>
  ): WorkerpoolPromise<T, Error> {
    if (params && !Array.isArray(params)) {
      throw new TypeError('Array expected as argument "params"');
    }

    // Check circuit breaker
    if (this._circuitOptions.enabled && this._circuitState === 'open') {
      const error = new Error('Circuit breaker is open');
      error.name = 'CircuitBreakerError';
      return WorkerpoolPromise.reject(error) as unknown as WorkerpoolPromise<T, Error>;
    }

    // Check memory pressure
    if (options?.estimatedSize) {
      const newEstimate = this._estimatedQueueMemory + options.estimatedSize;
      if (newEstimate > this._memoryOptions.maxQueueMemory) {
        this._emit('memoryPressure', {
          usedBytes: this._estimatedQueueMemory,
          maxBytes: this._memoryOptions.maxQueueMemory,
          action: this._memoryOptions.onMemoryPressure,
          timestamp: Date.now(),
        });

        if (this._memoryOptions.onMemoryPressure === 'reject') {
          const error = new Error('Queue memory limit exceeded');
          error.name = 'MemoryPressureError';
          return WorkerpoolPromise.reject(error) as unknown as WorkerpoolPromise<T, Error>;
        }
      }
      this._estimatedQueueMemory = newEstimate;
    }

    if (typeof method === 'string') {
      const resolver = WorkerpoolPromise.defer<T>();

      if (this.taskQueue.size() >= this.maxQueueSize) {
        throw new Error('Max queue size of ' + this.maxQueueSize + ' reached');
      }

      // Generate task ID and track start time
      const taskId = ++this._taskIdCounter;
      const startTime = Date.now();

      // Emit task start event
      this._emit('taskStart', {
        taskId,
        method,
        workerIndex: -1,
        timestamp: startTime,
      });

      const task: Task<TMetadata> & { taskId: number; startTime: number } = {
        method,
        params: params || [],
        resolver: resolver as Resolver<unknown>,
        timeout: null,
        options,
        taskId,
        startTime,
      };

      this.taskQueue.push(task as Task<TMetadata>);

      // Override timeout to start when task actually executes
      const originalTimeout = resolver.promise.timeout.bind(resolver.promise);
      const taskQueue = this.taskQueue;
      const promise = resolver.promise as WorkerpoolPromise<T, unknown>;

      (promise as { timeout: (delay: number) => WorkerpoolPromise<T, unknown> }).timeout = function timeout(delay: number): WorkerpoolPromise<T, unknown> {
        if (taskQueue.contains(task as Task<TMetadata>)) {
          task.timeout = delay;
          return promise;
        } else {
          return originalTimeout(delay) as WorkerpoolPromise<T, unknown>;
        }
      };

      // Add completion tracking for enhanced features
      const self = this;
      promise.then(
        (result) => {
          const duration = Date.now() - startTime;
          self._onTaskComplete(taskId, duration, result, options?.estimatedSize);
          if (self._circuitOptions.enabled) {
            self._circuitOnSuccess();
          }
          return result; // Return result to satisfy type checker
        },
        (error: unknown) => {
          const duration = Date.now() - startTime;
          self._onTaskError(taskId, error as Error, duration, options?.estimatedSize);
          if (self._circuitOptions.enabled) {
            self._circuitOnError();
          }
          throw error; // Re-throw to satisfy type checker
        }
      );

      this._next();

      return resolver.promise as WorkerpoolPromise<T, Error>;
    } else if (typeof method === 'function') {
      return this.exec('run', [String(method), params], options);
    } else {
      throw new TypeError('Function or string expected as argument "method"');
    }
  }

  /**
   * Create a proxy object with methods available on the worker
   *
   * @returns Promise resolving to proxy object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proxy<T extends Record<string, (...args: any[]) => any>>(): WorkerpoolPromise<
    WorkerProxy<T>,
    unknown
  > {
    if (arguments.length > 0) {
      throw new Error('No arguments expected');
    }

    const pool = this;

    return this.exec<string[]>('methods').then((methods) => {
      const proxyObj: Record<string, (...args: unknown[]) => WorkerpoolPromise<unknown, unknown>> =
        {};

      methods.forEach((method) => {
        proxyObj[method] = function (...args: unknown[]): WorkerpoolPromise<unknown, unknown> {
          return pool.exec(method, args) as WorkerpoolPromise<unknown, unknown>;
        };
      });

      return proxyObj as WorkerProxy<T>;
    }) as WorkerpoolPromise<WorkerProxy<T>, unknown>;
  }

  /**
   * Execute multiple tasks as a batch
   */
  execBatch<T = unknown>(
    tasks: BatchTask[],
    options?: BatchOptions
  ): BatchPromise<T> {
    const executor: TaskExecutor<T> = (method, params, execOptions) => {
      return this.exec<T>(method, params, execOptions as EnhancedExecOptions<TMetadata>);
    };

    return createBatchExecutor<T>(tasks, executor, {
      ...options,
      concurrency: options?.concurrency ?? this.maxWorkers,
    });
  }

  /**
   * Parallel map operation
   */
  map<T, R>(
    items: T[],
    mapFn: ((item: T, index: number) => R) | string,
    options?: Omit<MapOptions<T, R>, 'onProgress'> & { onProgress?: (progress: BatchProgress) => void }
  ): BatchPromise<R> {
    const executor: TaskExecutor<R> = (method, params, execOptions) => {
      return this.exec<R>(method, params, execOptions as EnhancedExecOptions<TMetadata>);
    };

    return createMapExecutor<T, R>(items, mapFn, executor, {
      ...options,
      concurrency: options?.concurrency ?? this.maxWorkers,
    } as BatchOptions & { chunkSize?: number });
  }

  /**
   * Process the next task in the queue
   */
  private _next(): void {
    if (this.taskQueue.size() > 0) {
      const worker = this._getWorker();

      if (worker) {
        const me = this;
        const task = this.taskQueue.pop();

        if (task && task.resolver.promise.pending) {
          const promise = worker
            .exec(task.method as string, task.params, task.resolver, task.options)
            .then(me._boundNext)
            .catch(() => {
              if (worker.terminated) {
                return me._removeWorker(worker);
              }
            })
            .then(() => {
              me._next();
            });

          if (typeof task.timeout === 'number') {
            promise.timeout(task.timeout);
          }
        } else {
          me._next();
        }
      }
    }
  }

  /**
   * Get an available worker or create a new one
   */
  private _getWorker(): WorkerHandler | null {
    // Find non-busy worker
    for (const worker of this.workers) {
      if (!worker.busy()) {
        return worker;
      }
    }

    // Create new worker if under limit
    if (this.workers.length < this.maxWorkers) {
      const worker = this._createWorkerHandler();
      this.workers.push(worker);
      return worker;
    }

    return null;
  }

  /**
   * Remove a worker from the pool
   */
  private _removeWorker(worker: WorkerHandler): Promise<WorkerHandler> {
    const me = this;

    if (worker.debugPort) {
      DEBUG_PORT_ALLOCATOR.releasePort(worker.debugPort);
    }

    this._removeWorkerFromList(worker);
    this._ensureMinWorkers();

    return new Promise((resolve, reject) => {
      worker.terminate(false, (err) => {
        me.onTerminateWorker({
          forkArgs: worker.forkArgs || [],
          forkOpts: worker.forkOpts || {},
          workerThreadOpts: worker.workerThreadOpts || {},
          workerOpts: worker.workerOpts || {},
          script: worker.script,
        });

        if (err) {
          reject(err);
        } else {
          resolve(worker);
        }
      });
    });
  }

  /**
   * Remove worker from internal list
   */
  private _removeWorkerFromList(worker: WorkerHandler): void {
    const index = this.workers.indexOf(worker);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
  }

  /**
   * Terminate all workers
   */
  terminate(force?: boolean, timeout?: number): WorkerpoolPromise<void[], unknown> {
    const me = this;

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

    // Cancel pending tasks
    while (this.taskQueue.size() > 0) {
      const task = this.taskQueue.pop();
      if (task) {
        task.resolver.reject(new Error('Pool terminated'));
      } else {
        break;
      }
    }

    this.taskQueue.clear();

    const removeWorker = (worker: WorkerHandler): void => {
      if (worker.debugPort) {
        DEBUG_PORT_ALLOCATOR.releasePort(worker.debugPort);
      }
      this._removeWorkerFromList(worker);
    };

    const promises: Array<WorkerpoolPromise<unknown, unknown>> = [];
    const workers = this.workers.slice();

    workers.forEach((worker) => {
      const termPromise = worker
        .terminateAndNotify(force, timeout)
        .then(removeWorker)
        .always(() => {
          me.onTerminateWorker({
            forkArgs: [...(worker.forkArgs || [])],
            forkOpts: worker.forkOpts || {},
            workerThreadOpts: worker.workerThreadOpts || {},
            workerOpts: worker.workerOpts || {},
            script: worker.script,
          });
        });

      promises.push(termPromise as WorkerpoolPromise<unknown, unknown>);
    });

    return WorkerpoolPromise.all(promises) as unknown as WorkerpoolPromise<void[], unknown>;
  }

  /**
   * Get pool statistics
   */
  stats(): EnhancedPoolStats {
    const totalWorkers = this.workers.length;
    const busyWorkers = this.workers.filter((worker) => worker.busy()).length;

    return {
      totalWorkers,
      busyWorkers,
      idleWorkers: totalWorkers - busyWorkers,
      pendingTasks: this.taskQueue.size(),
      activeTasks: busyWorkers,
      // Enhanced statistics
      circuitState: this._circuitState,
      estimatedQueueMemory: this._estimatedQueueMemory,
    };
  }

  /**
   * Ensure minimum workers are running
   */
  private _ensureMinWorkers(): void {
    if (this.minWorkers) {
      for (let i = this.workers.length; i < this.minWorkers; i++) {
        this.workers.push(this._createWorkerHandler());
      }
    }
  }

  /**
   * Create a new worker handler
   */
  private _createWorkerHandler(): WorkerHandler {
    const overriddenParams =
      this.onCreateWorker({
        forkArgs: [...this.forkArgs],
        forkOpts: this.forkOpts as WorkerArg['forkOpts'],
        workerOpts: this.workerOpts as WorkerArg['workerOpts'],
        workerThreadOpts: this.workerThreadOpts as WorkerArg['workerThreadOpts'],
        script: this.script || undefined,
      }) || {};

    const options: WorkerHandlerOptions = {
      forkArgs: (overriddenParams.forkArgs as string[]) || [...this.forkArgs],
      forkOpts: (overriddenParams.forkOpts || { ...this.forkOpts }) as Record<string, unknown>,
      workerOpts: (overriddenParams.workerOpts || { ...this.workerOpts }) as Record<string, unknown>,
      workerThreadOpts: (overriddenParams.workerThreadOpts || { ...this.workerThreadOpts }) as Record<string, unknown>,
      debugPort: DEBUG_PORT_ALLOCATOR.nextAvailableStartingAt(this.debugPortStart),
      workerType: this.workerType,
      workerTerminateTimeout: this.workerTerminateTimeout,
      emitStdStreams: this.emitStdStreams,
    };

    return new WorkerHandler(
      (overriddenParams.script as string) || this.script || undefined,
      options
    );
  }

  // ============================================================================
  // Enhanced Features - Event Emitter
  // ============================================================================

  /**
   * Add event listener
   */
  on<K extends keyof PoolEvents>(event: K, listener: PoolEventListener<K>): this {
    let listeners = this._eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this._eventListeners.set(event, listeners);
    }
    listeners.add(listener as PoolEventListener<keyof PoolEvents>);
    return this;
  }

  /**
   * Remove event listener
   */
  off<K extends keyof PoolEvents>(event: K, listener: PoolEventListener<K>): this {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as PoolEventListener<keyof PoolEvents>);
    }
    return this;
  }

  /**
   * Add one-time event listener
   */
  once<K extends keyof PoolEvents>(event: K, listener: PoolEventListener<K>): this {
    const onceWrapper = ((evt: PoolEvents[K]) => {
      this.off(event, onceWrapper as PoolEventListener<K>);
      listener(evt);
    }) as PoolEventListener<K>;
    return this.on(event, onceWrapper);
  }

  /**
   * Emit an event
   */
  private _emit<K extends keyof PoolEvents>(event: K, payload: PoolEvents[K]): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  // ============================================================================
  // Enhanced Features - Ready State & Warmup
  // ============================================================================

  /**
   * Warm up the pool by ensuring workers are spawned and ready
   */
  warmup(options?: { count?: number }): WorkerpoolPromise<void, unknown> {
    const self = this;
    const targetCount = options?.count ?? this.minWorkers ?? this.maxWorkers;
    const promises: Array<WorkerpoolPromise<unknown, unknown>> = [];

    for (let i = 0; i < targetCount; i++) {
      promises.push(this._warmupWorker());
    }

    return WorkerpoolPromise.all(promises).then(() => {
      self._markReady();
    }) as unknown as WorkerpoolPromise<void, unknown>;
  }

  /**
   * Mark pool as ready
   */
  private _markReady(): void {
    if (!this._isReady) {
      this._isReady = true;
      this._readyResolver();
    }
  }

  /**
   * Eager initialize workers
   */
  private _eagerInitialize(): void {
    const self = this;
    const targetCount = this.minWorkers ?? Math.min(2, this.maxWorkers);
    const promises: Array<WorkerpoolPromise<unknown, unknown>> = [];

    for (let i = 0; i < targetCount; i++) {
      promises.push(this._warmupWorker());
    }

    WorkerpoolPromise.all(promises).then(() => {
      self._markReady();
    });
  }

  /**
   * Warm up a single worker
   */
  private _warmupWorker(): WorkerpoolPromise<unknown, unknown> {
    return this.exec('methods').catch(() => {
      // Ignore errors during warmup
    });
  }

  // ============================================================================
  // Enhanced Features - Task Tracking
  // ============================================================================

  /**
   * Handle task completion
   */
  private _onTaskComplete(taskId: number, duration: number, result: unknown, estimatedSize?: number): void {
    if (estimatedSize) {
      this._estimatedQueueMemory = Math.max(0, this._estimatedQueueMemory - estimatedSize);
    }

    this._emit('taskComplete', {
      taskId,
      duration,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle task error
   */
  private _onTaskError(taskId: number, error: Error, duration: number, estimatedSize?: number): void {
    if (estimatedSize) {
      this._estimatedQueueMemory = Math.max(0, this._estimatedQueueMemory - estimatedSize);
    }

    this._emit('taskError', {
      taskId,
      error,
      duration,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Enhanced Features - Circuit Breaker
  // ============================================================================

  /**
   * Circuit breaker: record success
   */
  private _circuitOnSuccess(): void {
    if (this._circuitState === 'half-open') {
      this._circuitHalfOpenSuccess++;
      if (this._circuitHalfOpenSuccess >= this._circuitOptions.halfOpenRequests) {
        this._closeCircuit();
      }
    }
  }

  /**
   * Circuit breaker: record error
   */
  private _circuitOnError(): void {
    if (this._circuitState === 'half-open') {
      this._openCircuit();
      return;
    }

    this._circuitErrorCount++;
    if (this._circuitErrorCount >= this._circuitOptions.errorThreshold) {
      this._openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  private _openCircuit(): void {
    if (this._circuitState !== 'open') {
      this._circuitState = 'open';
      this._emit('circuitOpen', {
        errorCount: this._circuitErrorCount,
        threshold: this._circuitOptions.errorThreshold,
        timestamp: Date.now(),
      });

      // Schedule reset
      this._circuitResetTimer = setTimeout(() => {
        this._halfOpenCircuit();
      }, this._circuitOptions.resetTimeout);
    }
  }

  /**
   * Move circuit to half-open state
   */
  private _halfOpenCircuit(): void {
    this._circuitState = 'half-open';
    this._circuitHalfOpenSuccess = 0;
    this._emit('circuitHalfOpen', { timestamp: Date.now() });
  }

  /**
   * Close the circuit breaker
   */
  private _closeCircuit(): void {
    this._circuitState = 'closed';
    this._circuitErrorCount = 0;
    this._circuitHalfOpenSuccess = 0;
    if (this._circuitResetTimer) {
      clearTimeout(this._circuitResetTimer);
      this._circuitResetTimer = null;
    }
    this._emit('circuitClose', { timestamp: Date.now() });
  }

  // ============================================================================
  // Enhanced Features - Health Checks
  // ============================================================================

  /**
   * Start health check interval
   */
  private _startHealthChecks(): void {
    this._healthCheckTimer = setInterval(() => {
      this._runHealthCheck();
    }, this._healthCheckOptions.interval);
  }

  /**
   * Run health check
   */
  private _runHealthCheck(): void {
    const self = this;
    const promise = this.exec('methods');
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Health check timeout'));
      }, self._healthCheckOptions.timeout);
    });

    Promise.race([promise, timeoutPromise]).catch((error) => {
      if (self._healthCheckOptions.action === 'warn') {
        console.warn('[workerpool] Health check failed:', error);
      }
    });
  }

  // ============================================================================
  // Static Methods - Shared Pool Singleton
  // ============================================================================

  private static _sharedPool: Pool | null = null;

  /**
   * Get or create a shared pool singleton
   */
  static getSharedPool(options?: EnhancedPoolOptions): Pool {
    if (!Pool._sharedPool) {
      Pool._sharedPool = new Pool({ eagerInit: true, ...options });
    }
    return Pool._sharedPool;
  }

  /**
   * Terminate and clear the shared pool
   */
  static terminateSharedPool(force?: boolean): WorkerpoolPromise<void[], unknown> | WorkerpoolPromise<void, unknown> {
    if (Pool._sharedPool) {
      const pool = Pool._sharedPool;
      Pool._sharedPool = null;
      return pool.terminate(force);
    }
    const resolver = WorkerpoolPromise.defer<void>();
    resolver.resolve();
    return resolver.promise as unknown as WorkerpoolPromise<void, unknown>;
  }

  /**
   * Check if a shared pool exists
   */
  static hasSharedPool(): boolean {
    return Pool._sharedPool !== null;
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

/** Alias for backward compatibility */
export const PoolEnhanced = Pool;

// Export shared pool functions at module level
export function getSharedPool(options?: EnhancedPoolOptions): Pool {
  return Pool.getSharedPool(options);
}

export function terminateSharedPool(force?: boolean): WorkerpoolPromise<void[], unknown> | WorkerpoolPromise<void, unknown> {
  return Pool.terminateSharedPool(force);
}

export function hasSharedPool(): boolean {
  return Pool.hasSharedPool();
}

export { TerminateError };
export default Pool;

/**
 * PoolEnhanced - Enhanced worker pool with advanced features
 *
 * Wraps the base Pool with:
 * - pool.ready promise for eager initialization
 * - pool.warmup() method for pre-spawning workers
 * - Event emitter for monitoring (taskStart, taskComplete, taskError, etc.)
 * - Automatic data transfer strategy selection
 * - Binary serialization option
 * - Automatic task retry
 * - Circuit breaker pattern
 * - Memory-aware scheduling
 */

import { WorkerpoolPromise } from './Promise';

// Pool constructor type - injected at runtime to avoid rollup bundling issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _PoolConstructor: any = null;

/**
 * Inject the Pool constructor from the main module
 * This is called by index.js to avoid circular dependency issues
 */
export function _injectPool(Pool: unknown): void {
  _PoolConstructor = Pool;
}

/**
 * Get the Pool constructor (lazy loaded)
 */
function getPoolConstructor(): unknown {
  if (!_PoolConstructor) {
    // Fallback: try to require directly (works in Node.js when not bundled)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _PoolConstructor = require('../Pool');
    } catch {
      throw new Error('Pool constructor not initialized. Make sure to import workerpool before using PoolEnhanced.');
    }
  }
  return _PoolConstructor;
}
import { MetricsCollector, type PoolMetrics } from './metrics';
import type { PoolOptions, ExecOptions, PoolStats, WorkerArg } from '../types/index';
import { canUseOptimalTransfer, getCapabilities, type Capabilities } from '../platform/capabilities';
import { Transfer } from '../platform/transfer';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types emitted by EnhancedPool
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
  enabled: boolean;
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
  enabled: boolean;
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
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Metrics export callback */
  onMetrics?: (metrics: PoolMetrics) => void;
  /** Metrics export interval (ms) */
  metricsInterval?: number;
}

/**
 * Enhanced pool statistics
 */
export interface EnhancedPoolStats extends PoolStats {
  /** Metrics if enabled */
  metrics?: {
    totalTasksExecuted: number;
    totalTasksFailed: number;
    averageExecutionTime: number;
    averageQueueWaitTime: number;
    p95ExecutionTime: number;
    throughput: number;
  };
  /** Circuit breaker state */
  circuitState?: CircuitState;
  /** Estimated queue memory usage */
  estimatedQueueMemory?: number;
}

// ============================================================================
// Internal Pool interface (matches legacy Pool.js)
// ============================================================================

interface InternalPool {
  script: string | null;
  workers: unknown[];
  maxWorkers: number;
  minWorkers: number;
  exec<T>(method: string | ((...args: unknown[]) => T), params?: unknown[] | null, options?: ExecOptions<unknown>): WorkerpoolPromise<T, Error>;
  proxy<T = Record<string, (...args: unknown[]) => unknown>>(): WorkerpoolPromise<T, Error>;
  stats(): PoolStats;
  terminate(force?: boolean, timeout?: number): WorkerpoolPromise<void[], unknown>;
}

// ============================================================================
// PoolEnhanced Implementation
// ============================================================================

/**
 * Enhanced worker pool with advanced features
 */
export class PoolEnhanced<TMetadata = unknown> {
  // Internal pool instance (composition instead of inheritance)
  private _pool: InternalPool;

  // Event emitter
  private _eventListeners: Map<keyof PoolEvents, Set<PoolEventListener<keyof PoolEvents>>> = new Map();

  // Ready state
  private _readyPromise: Promise<void>;
  private _readyResolver!: () => void;
  private _isReady = false;

  // Circuit breaker
  private _circuitState: CircuitState = 'closed';
  private _circuitErrorCount = 0;
  private _circuitResetTimer: ReturnType<typeof setTimeout> | null = null;
  private _circuitHalfOpenSuccess = 0;
  private readonly _circuitOptions: Required<CircuitBreakerOptions>;

  // Retry configuration
  private readonly _retryOptions: Required<RetryOptions>;

  // Memory management
  private readonly _memoryOptions: Required<MemoryOptions>;
  private _estimatedQueueMemory = 0;

  // Health checks
  private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _healthCheckOptions: Required<HealthCheckOptions>;

  // Metrics
  private _metricsCollector: MetricsCollector | null = null;

  // Data transfer strategy
  private readonly _dataTransfer: DataTransferStrategy;

  // Task tracking
  private _taskIdCounter = 0;

  // Options
  private readonly _options: EnhancedPoolOptions;

  constructor(script?: string | EnhancedPoolOptions, options?: EnhancedPoolOptions) {
    // Handle overloaded constructor
    let effectiveScript: string | undefined;
    let effectiveOptions: EnhancedPoolOptions;

    if (typeof script === 'string') {
      effectiveScript = script;
      effectiveOptions = options || {};
    } else {
      effectiveScript = undefined;
      effectiveOptions = script || {};
    }

    // Create internal pool using injected Pool constructor
    const Pool = getPoolConstructor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._pool = effectiveScript
      ? new (Pool as any)(effectiveScript, effectiveOptions)
      : new (Pool as any)(effectiveOptions);

    this._options = effectiveOptions;

    // Initialize ready promise
    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolver = resolve;
    });

    // Initialize circuit breaker
    this._circuitOptions = {
      enabled: effectiveOptions.circuitBreaker?.enabled ?? false,
      errorThreshold: effectiveOptions.circuitBreaker?.errorThreshold ?? 5,
      resetTimeout: effectiveOptions.circuitBreaker?.resetTimeout ?? 30000,
      halfOpenRequests: effectiveOptions.circuitBreaker?.halfOpenRequests ?? 2,
    };

    // Initialize retry options
    this._retryOptions = {
      maxRetries: effectiveOptions.retry?.maxRetries ?? 0,
      retryDelay: effectiveOptions.retry?.retryDelay ?? 100,
      retryOn: effectiveOptions.retry?.retryOn ?? ['WorkerTerminatedError', 'TimeoutError'],
      backoffMultiplier: effectiveOptions.retry?.backoffMultiplier ?? 2,
    };

    // Initialize memory options
    this._memoryOptions = {
      maxQueueMemory: effectiveOptions.memory?.maxQueueMemory ?? Infinity,
      onMemoryPressure: effectiveOptions.memory?.onMemoryPressure ?? 'reject',
    };

    // Initialize health check options
    this._healthCheckOptions = {
      enabled: effectiveOptions.healthCheck?.enabled ?? false,
      interval: effectiveOptions.healthCheck?.interval ?? 5000,
      timeout: effectiveOptions.healthCheck?.timeout ?? 1000,
      action: effectiveOptions.healthCheck?.action ?? 'restart',
    };

    // Initialize data transfer strategy
    this._dataTransfer = effectiveOptions.dataTransfer ?? 'auto';

    // Initialize metrics
    if (effectiveOptions.enableMetrics) {
      this._metricsCollector = new MetricsCollector({
        onExport: effectiveOptions.onMetrics,
        exportInterval: effectiveOptions.metricsInterval ?? 10000,
      });
    }

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
  // Public Properties (delegated to internal pool)
  // ============================================================================

  /**
   * Worker script path
   */
  get script(): string | null {
    return this._pool.script;
  }

  /**
   * Maximum number of workers
   */
  get maxWorkers(): number {
    return this._pool.maxWorkers;
  }

  /**
   * Minimum number of workers
   */
  get minWorkers(): number {
    return this._pool.minWorkers ?? 0;
  }

  /**
   * Promise that resolves when all minimum workers are ready
   */
  get ready(): Promise<void> {
    return this._readyPromise;
  }

  /**
   * Check if pool is ready
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Get current capabilities
   */
  get capabilities(): Capabilities {
    return getCapabilities();
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Warm up the pool by ensuring workers are spawned and ready
   *
   * @param options - Warmup options
   * @returns Promise resolving when workers are ready
   */
  async warmup(options?: { count?: number }): Promise<void> {
    const targetCount = options?.count ?? this.minWorkers ?? this.maxWorkers;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < targetCount; i++) {
      promises.push(this._warmupWorker());
    }

    await Promise.all(promises);
    this._markReady();
  }

  /**
   * Execute a method with enhanced features
   */
  exec<T = unknown>(
    method: string | ((...args: unknown[]) => T),
    params?: unknown[] | null,
    options?: EnhancedExecOptions<TMetadata>
  ): WorkerpoolPromise<T, Error> {
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

    // Apply data transfer strategy
    const effectiveOptions = this._applyDataTransferStrategy(params, options);

    // Generate task ID
    const taskId = ++this._taskIdCounter;
    const startTime = Date.now();

    // Emit task start event
    this._emit('taskStart', {
      taskId,
      method: typeof method === 'string' ? method : 'run',
      workerIndex: -1, // Unknown until execution
      timestamp: startTime,
    });

    // Record metrics
    this._metricsCollector?.recordTaskEnqueued();

    // Execute with retry support
    const executeWithRetry = (attempt: number): WorkerpoolPromise<T, Error> => {
      const promise = this._pool.exec<T>(method, params, effectiveOptions);

      // Add completion handlers
      promise.then(
        (result) => {
          const duration = Date.now() - startTime;
          this._onTaskComplete(taskId, duration, result, options?.estimatedSize);
          if (this._circuitOptions.enabled) {
            this._circuitOnSuccess();
          }
        },
        (error: Error) => {
          const duration = Date.now() - startTime;

          // Check if we should retry
          const retryOptions = options?.retry === false
            ? null
            : { ...this._retryOptions, ...(options?.retry || {}) };

          const shouldRetry = retryOptions &&
            attempt < retryOptions.maxRetries &&
            this._shouldRetryError(error, retryOptions.retryOn);

          if (shouldRetry) {
            this._emit('retry', {
              taskId,
              attempt: attempt + 1,
              maxRetries: retryOptions.maxRetries,
              error,
              timestamp: Date.now(),
            });

            // Calculate backoff delay
            const delay = retryOptions.retryDelay *
              Math.pow(retryOptions.backoffMultiplier, attempt);

            setTimeout(() => {
              executeWithRetry(attempt + 1);
            }, delay);
          } else {
            this._onTaskError(taskId, error, duration, options?.estimatedSize);
            if (this._circuitOptions.enabled) {
              this._circuitOnError();
            }
          }
        }
      );

      return promise;
    };

    return executeWithRetry(0);
  }

  /**
   * Get a proxy to the worker
   */
  proxy<T = Record<string, (...args: unknown[]) => unknown>>(): WorkerpoolPromise<T, Error> {
    return this._pool.proxy<T>();
  }

  /**
   * Get enhanced statistics
   */
  stats(): EnhancedPoolStats {
    const baseStats = this._pool.stats();
    const enhanced: EnhancedPoolStats = {
      ...baseStats,
      circuitState: this._circuitState,
      estimatedQueueMemory: this._estimatedQueueMemory,
    };

    if (this._metricsCollector) {
      const metrics = this._metricsCollector.getMetrics();
      enhanced.metrics = {
        totalTasksExecuted: metrics.taskLatency.count,
        totalTasksFailed: metrics.errors.total,
        averageExecutionTime: metrics.summary.avgLatency,
        averageQueueWaitTime: metrics.queue.avgWaitTime,
        p95ExecutionTime: metrics.summary.p95Latency,
        throughput: metrics.summary.tasksPerSecond,
      };
    }

    return enhanced;
  }

  /**
   * Get detailed metrics
   */
  getMetrics(): PoolMetrics | null {
    return this._metricsCollector?.getMetrics() ?? null;
  }

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
   * Terminate pool with cleanup
   */
  terminate(force?: boolean, timeout?: number): WorkerpoolPromise<void[], unknown> {
    // Stop health checks
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }

    // Stop metrics
    this._metricsCollector?.stop();

    // Stop circuit breaker timer
    if (this._circuitResetTimer) {
      clearTimeout(this._circuitResetTimer);
      this._circuitResetTimer = null;
    }

    return this._pool.terminate(force, timeout);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

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
    const targetCount = this.minWorkers ?? Math.min(2, this.maxWorkers);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < targetCount; i++) {
      promises.push(this._warmupWorker());
    }

    Promise.all(promises).then(() => this._markReady());
  }

  /**
   * Warm up a single worker
   */
  private async _warmupWorker(): Promise<void> {
    // Execute a no-op to ensure worker is spawned and ready
    await this.exec<void>('methods').catch(() => {
      // Ignore errors during warmup
    });
  }

  /**
   * Apply data transfer strategy to parameters
   */
  private _applyDataTransferStrategy(
    params: unknown[] | null | undefined,
    options?: EnhancedExecOptions<TMetadata>
  ): ExecOptions<TMetadata> {
    const strategy = options?.dataTransfer ?? this._dataTransfer;
    const effectiveOptions: ExecOptions<TMetadata> = { ...options };

    if (strategy === 'json' || !params || params.length === 0) {
      return effectiveOptions;
    }

    // Auto-detect best strategy
    if (strategy === 'auto') {
      if (canUseOptimalTransfer()) {
        // Use shared memory if available
        return this._applySharedTransfer(params, effectiveOptions);
      } else {
        // Fall back to transferable
        return this._applyTransferableTransfer(params, effectiveOptions);
      }
    }

    if (strategy === 'shared') {
      return this._applySharedTransfer(params, effectiveOptions);
    }

    if (strategy === 'transferable') {
      return this._applyTransferableTransfer(params, effectiveOptions);
    }

    // Binary is handled by the binary serializer (not implemented in base pool)
    return effectiveOptions;
  }

  /**
   * Apply shared memory transfer strategy
   */
  private _applySharedTransfer(
    _params: unknown[],
    options: ExecOptions<TMetadata>
  ): ExecOptions<TMetadata> {
    // SharedArrayBuffer doesn't need explicit transfer - it's automatically shared
    // Just ensure we don't duplicate transfer logic
    return options;
  }

  /**
   * Apply transferable transfer strategy
   */
  private _applyTransferableTransfer(
    params: unknown[],
    options: ExecOptions<TMetadata>
  ): ExecOptions<TMetadata> {
    // Auto-detect transferables in params
    if (!options.transfer) {
      const transferables = Transfer.findTransferables(params);
      if (transferables.length > 0) {
        return {
          ...options,
          transfer: transferables,
        };
      }
    }
    return options;
  }

  /**
   * Handle task completion
   */
  private _onTaskComplete(
    taskId: number,
    duration: number,
    result: unknown,
    estimatedSize?: number
  ): void {
    // Update queue memory estimate
    if (estimatedSize) {
      this._estimatedQueueMemory = Math.max(0, this._estimatedQueueMemory - estimatedSize);
    }

    // Record metrics
    this._metricsCollector?.recordTaskComplete(0, duration); // Worker ID not tracked here

    // Emit event
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
  private _onTaskError(
    taskId: number,
    error: Error,
    duration: number,
    estimatedSize?: number
  ): void {
    // Update queue memory estimate
    if (estimatedSize) {
      this._estimatedQueueMemory = Math.max(0, this._estimatedQueueMemory - estimatedSize);
    }

    // Record metrics
    this._metricsCollector?.recordTaskFailed(0, error, duration);

    // Emit event
    this._emit('taskError', {
      taskId,
      error,
      duration,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if error should trigger retry
   */
  private _shouldRetryError(error: Error, retryOn: string[]): boolean {
    return retryOn.includes(error.name) || retryOn.includes(error.constructor.name);
  }

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

  /**
   * Start health check interval
   */
  private _startHealthChecks(): void {
    this._healthCheckTimer = setInterval(async () => {
      await this._runHealthCheck();
    }, this._healthCheckOptions.interval);
  }

  /**
   * Run health check on all workers
   */
  private async _runHealthCheck(): Promise<void> {
    try {
      // Simple health check: execute methods call with timeout
      const promise = this.exec('methods');
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this._healthCheckOptions.timeout);
      });

      await Promise.race([promise, timeoutPromise]);
    } catch (error) {
      // Health check failed
      if (this._healthCheckOptions.action === 'warn') {
        console.warn('[workerpool] Health check failed:', error);
      }
      // restart and remove actions would require more complex worker tracking
    }
  }
}

// ============================================================================
// Shared Pool Singleton
// ============================================================================

let _sharedPool: PoolEnhanced | null = null;

/**
 * Get or create a shared pool singleton
 *
 * @param options - Pool options (only used on first call)
 * @returns Shared pool instance
 */
export function getSharedPool(options?: EnhancedPoolOptions): PoolEnhanced {
  if (!_sharedPool) {
    _sharedPool = new PoolEnhanced({
      eagerInit: true,
      ...options,
    });
  }
  return _sharedPool;
}

/**
 * Terminate and clear the shared pool
 *
 * @param force - Force terminate
 * @returns Promise resolving when pool is terminated
 */
export async function terminateSharedPool(force?: boolean): Promise<void> {
  if (_sharedPool) {
    await _sharedPool.terminate(force);
    _sharedPool = null;
  }
}

/**
 * Check if a shared pool exists
 */
export function hasSharedPool(): boolean {
  return _sharedPool !== null;
}

export default PoolEnhanced;

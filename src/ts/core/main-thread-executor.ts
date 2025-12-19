/**
 * Main Thread Executor
 *
 * Provides graceful degradation for environments that don't support
 * Web Workers. Executes tasks on the main thread while maintaining
 * the same API as the worker pool.
 *
 * Use cases:
 * - Old browsers without Web Worker support
 * - Testing environments
 * - Server-side rendering where workers aren't needed
 * - Environments with restricted worker creation
 */

import { WorkerpoolPromise } from './Promise';
import type {
  ExecOptions,
  PoolStats,
  WorkerProxy,
  BatchTask,
  BatchOptions,
  BatchResult,
  BatchPromise,
  ParallelOptions,
  ReduceOptions,
  FindOptions,
  PredicateOptions,
  ForEachResult,
  ParallelPromise,
  ReducerFn,
  CombinerFn,
  PredicateFn,
  ConsumerFn,
} from '../types/index';
import type { PoolEvents, PoolEventListener, EnhancedPoolStats } from './Pool';
import { createBatchExecutor, type TaskExecutor } from './batch-executor';
import {
  createParallelReduce,
  createParallelForEach,
  createParallelFilter,
  createParallelSome,
  createParallelEvery,
  createParallelFind,
  createParallelFindIndex,
} from './parallel-processing';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for MainThreadExecutor
 */
export interface MainThreadExecutorOptions {
  /**
   * Registered methods available for execution.
   * Methods can be called by name using exec('methodName', args).
   */
  methods?: Record<string, (...args: unknown[]) => unknown>;

  /**
   * Maximum number of concurrent tasks (simulated).
   * Tasks are still executed sequentially but this affects batch concurrency.
   * @default 1
   */
  maxConcurrency?: number;

  /**
   * Whether to yield to the event loop between tasks.
   * Helps prevent UI blocking when processing many tasks.
   * @default true
   */
  yieldBetweenTasks?: boolean;

  /**
   * Yield interval in milliseconds.
   * How long to wait between tasks when yielding.
   * @default 0 (setTimeout 0, yields to event loop)
   */
  yieldInterval?: number;
}

/**
 * Main thread executor that mimics Pool API
 */
export class MainThreadExecutor {
  /** Registered methods */
  private methods: Record<string, (...args: unknown[]) => unknown>;

  /** Configuration options */
  private options: Required<MainThreadExecutorOptions>;

  /** Event listeners */
  private eventListeners: Map<string, Set<PoolEventListener<keyof PoolEvents>>> = new Map();

  /** Task ID counter */
  private taskIdCounter = 0;

  /** Active task count */
  private activeTasks = 0;

  /** Ready promise (always immediately resolved) */
  readonly ready: WorkerpoolPromise<void, unknown>;

  /** Always ready */
  readonly isReady = true;

  constructor(options: MainThreadExecutorOptions = {}) {
    this.methods = options.methods || {};
    this.options = {
      methods: this.methods,
      maxConcurrency: options.maxConcurrency ?? 1,
      yieldBetweenTasks: options.yieldBetweenTasks ?? true,
      yieldInterval: options.yieldInterval ?? 0,
    };

    // Immediately resolved ready promise
    const { promise, resolve } = WorkerpoolPromise.defer<void>();
    resolve();
    this.ready = promise as WorkerpoolPromise<void, unknown>;
  }

  // ===========================================================================
  // Core Execution
  // ===========================================================================

  /**
   * Execute a method or function
   *
   * @param method - Method name or function to execute
   * @param params - Parameters to pass
   * @param options - Execution options (transfer is ignored)
   * @returns Promise resolving to result
   */
  exec<T = unknown>(
    method: string | ((...args: unknown[]) => T),
    params?: unknown[] | null,
    options?: ExecOptions
  ): WorkerpoolPromise<T, unknown> {
    if (params && !Array.isArray(params)) {
      throw new TypeError('Array expected as argument "params"');
    }

    const taskId = ++this.taskIdCounter;
    const startTime = Date.now();

    // Emit task start event
    this.emit('taskStart', {
      taskId,
      method: typeof method === 'string' ? method : 'function',
      workerIndex: 0,
      timestamp: startTime,
    });

    const { promise, resolve, reject } = WorkerpoolPromise.defer<T>();

    const executeTask = async (): Promise<void> => {
      this.activeTasks++;

      try {
        let result: T;

        if (typeof method === 'string') {
          // Execute registered method
          if (method === 'methods') {
            // Built-in methods command
            result = Object.keys(this.methods) as unknown as T;
          } else if (method === 'run') {
            // Dynamic function execution
            const [fnStr, fnArgs] = params as [string, unknown[]];
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            const fn = new Function('return (' + fnStr + ').apply(this, arguments);');
            result = fn.apply(null, fnArgs || []) as T;
          } else if (this.methods[method]) {
            result = this.methods[method].apply(null, params || []) as T;
          } else if (this.isInlineFunction(method)) {
            // Handle inline function strings like "(function(...) {...})"
            // These are used by parallel processing functions
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            const fn = new Function('return (' + method.trim() + ').apply(this, arguments);');
            result = fn.apply(null, params || []) as T;
          } else {
            throw new Error(`Unknown method "${method}"`);
          }
        } else {
          // Execute function directly
          result = method.apply(null, params || []);
        }

        // Handle promise results
        if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
          result = await (result as unknown as Promise<T>);
        }

        // Yield if configured
        if (this.options.yieldBetweenTasks) {
          await this.yield();
        }

        const duration = Date.now() - startTime;
        this.emit('taskComplete', {
          taskId,
          duration,
          result,
          timestamp: Date.now(),
        });

        resolve(result);
      } catch (err) {
        const duration = Date.now() - startTime;
        const error = err instanceof Error ? err : new Error(String(err));

        this.emit('taskError', {
          taskId,
          error,
          duration,
          timestamp: Date.now(),
        });

        reject(error);
      } finally {
        this.activeTasks--;
      }
    };

    // Start execution immediately
    executeTask();

    return promise as WorkerpoolPromise<T, unknown>;
  }

  /**
   * Yield to the event loop
   */
  private yield(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this.options.yieldInterval);
    });
  }

  /**
   * Check if a method string is an inline function definition
   * These are used by parallel processing functions for dynamic execution
   */
  private isInlineFunction(method: string): boolean {
    const trimmed = method.trim();
    return (
      trimmed.startsWith('(function') ||
      trimmed.startsWith('function') ||
      trimmed.startsWith('(async function') ||
      trimmed.startsWith('async function') ||
      // Arrow functions
      /^\([^)]*\)\s*=>/.test(trimmed) ||
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>/.test(trimmed)
    );
  }

  /**
   * Create a proxy object with registered methods
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proxy<T extends Record<string, (...args: any[]) => any>>(): WorkerpoolPromise<
    WorkerProxy<T>,
    unknown
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxyObj: Record<string, (...args: unknown[]) => WorkerpoolPromise<unknown, unknown>> = {};

    for (const methodName of Object.keys(this.methods)) {
      proxyObj[methodName] = (...args: unknown[]) => {
        return this.exec(methodName, args) as WorkerpoolPromise<unknown, unknown>;
      };
    }

    const { promise, resolve } = WorkerpoolPromise.defer<WorkerProxy<T>>();
    resolve(proxyObj as WorkerProxy<T>);
    return promise as WorkerpoolPromise<WorkerProxy<T>, unknown>;
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Execute multiple tasks as a batch
   */
  execBatch<T = unknown>(
    tasks: BatchTask[],
    options?: BatchOptions
  ): BatchPromise<T> {
    const executor: TaskExecutor<T> = (method, params, execOptions) => {
      return this.exec<T>(method as string, params, execOptions);
    };

    return createBatchExecutor<T>(tasks, executor, {
      ...options,
      concurrency: options?.concurrency ?? this.options.maxConcurrency,
    });
  }

  /**
   * Parallel map operation
   */
  map<T, R>(
    items: T[],
    mapFn: ((item: T, index: number) => R) | string,
    options?: ParallelOptions
  ): BatchPromise<R> {
    // For main thread, execute sequentially
    const tasks: BatchTask[] = items.map((item, index) => ({
      method: mapFn as string | ((...args: unknown[]) => unknown),
      params: [item, index],
    }));

    return this.execBatch<R>(tasks, options);
  }

  // ===========================================================================
  // Parallel Array Operations
  // ===========================================================================

  /**
   * Parallel reduce (sequential on main thread)
   */
  reduce<T, A>(
    items: T[],
    reducerFn: ReducerFn<T, A> | string,
    combinerFn: CombinerFn<A>,
    options: ReduceOptions<A>
  ): ParallelPromise<A> {
    const executor: TaskExecutor<A> = (method, params, execOptions) => {
      return this.exec<A>(method as string, params, execOptions);
    };

    return createParallelReduce<T, A>(items, reducerFn, combinerFn, executor, {
      ...options,
      concurrency: 1, // Sequential on main thread
    });
  }

  /**
   * Parallel forEach (sequential on main thread)
   */
  forEach<T>(
    items: T[],
    fn: ConsumerFn<T> | string,
    options?: ParallelOptions
  ): ParallelPromise<ForEachResult> {
    const executor: TaskExecutor<void> = (method, params, execOptions) => {
      return this.exec<void>(method as string, params, execOptions);
    };

    return createParallelForEach<T>(items, fn, executor, {
      ...options,
      concurrency: 1,
    });
  }

  /**
   * Parallel filter (sequential on main thread)
   */
  filter<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: ParallelOptions
  ): ParallelPromise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executor: TaskExecutor<any> = (method, params, execOptions) => {
      return this.exec(method as string, params, execOptions);
    };

    return createParallelFilter<T>(items, predicateFn, executor, {
      ...options,
      concurrency: 1,
    });
  }

  /**
   * Parallel some (sequential on main thread)
   */
  some<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: PredicateOptions
  ): ParallelPromise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executor: TaskExecutor<any> = (method, params, execOptions) => {
      return this.exec(method as string, params, execOptions);
    };

    return createParallelSome<T>(items, predicateFn, executor, {
      ...options,
      concurrency: 1,
    });
  }

  /**
   * Parallel every (sequential on main thread)
   */
  every<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: PredicateOptions
  ): ParallelPromise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executor: TaskExecutor<any> = (method, params, execOptions) => {
      return this.exec(method as string, params, execOptions);
    };

    return createParallelEvery<T>(items, predicateFn, executor, {
      ...options,
      concurrency: 1,
    });
  }

  /**
   * Parallel find (sequential on main thread)
   */
  find<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: FindOptions
  ): ParallelPromise<T | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executor: TaskExecutor<any> = (method, params, execOptions) => {
      return this.exec(method as string, params, execOptions);
    };

    return createParallelFind<T>(items, predicateFn, executor, {
      ...options,
      concurrency: 1,
    });
  }

  /**
   * Parallel findIndex (sequential on main thread)
   */
  findIndex<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: FindOptions
  ): ParallelPromise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const executor: TaskExecutor<any> = (method, params, execOptions) => {
      return this.exec(method as string, params, execOptions);
    };

    return createParallelFindIndex<T>(items, predicateFn, executor, {
      ...options,
      concurrency: 1,
    });
  }

  // ===========================================================================
  // Pool Management
  // ===========================================================================

  /**
   * Terminate the executor (no-op for main thread)
   */
  terminate(force?: boolean, timeout?: number): WorkerpoolPromise<void[], unknown> {
    const { promise, resolve } = WorkerpoolPromise.defer<void[]>();
    resolve([]);
    return promise as WorkerpoolPromise<void[], unknown>;
  }

  /**
   * Get executor statistics
   */
  stats(): EnhancedPoolStats {
    return {
      totalWorkers: 1, // Main thread
      busyWorkers: this.activeTasks > 0 ? 1 : 0,
      idleWorkers: this.activeTasks > 0 ? 0 : 1,
      pendingTasks: 0,
      activeTasks: this.activeTasks,
      circuitState: 'closed',
      estimatedQueueMemory: 0,
    };
  }

  /**
   * Warmup (no-op for main thread)
   */
  warmup(options?: { count?: number }): WorkerpoolPromise<void, unknown> {
    const { promise, resolve } = WorkerpoolPromise.defer<void>();
    resolve();
    return promise as WorkerpoolPromise<void, unknown>;
  }

  // ===========================================================================
  // Event Emitter
  // ===========================================================================

  /**
   * Add event listener
   */
  on<K extends keyof PoolEvents>(event: K, listener: PoolEventListener<K>): this {
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.eventListeners.set(event, listeners);
    }
    listeners.add(listener as PoolEventListener<keyof PoolEvents>);
    return this;
  }

  /**
   * Remove event listener
   */
  off<K extends keyof PoolEvents>(event: K, listener: PoolEventListener<K>): this {
    const listeners = this.eventListeners.get(event);
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
  private emit<K extends keyof PoolEvents>(event: K, payload: PoolEvents[K]): void {
    const listeners = this.eventListeners.get(event);
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

  // ===========================================================================
  // Method Registration
  // ===========================================================================

  /**
   * Register additional methods
   */
  register(methods: Record<string, (...args: unknown[]) => unknown>): this {
    Object.assign(this.methods, methods);
    return this;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Check if Web Workers are supported in the current environment
 */
export function hasWorkerSupport(): boolean {
  // Browser environment
  if (typeof window !== 'undefined') {
    return typeof Worker !== 'undefined';
  }

  // Node.js environment
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      require('worker_threads');
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Create either a Pool or MainThreadExecutor based on environment
 *
 * @param poolFactory - Factory function to create Pool
 * @param options - MainThreadExecutor options (used if workers not supported)
 * @returns Pool or MainThreadExecutor
 *
 * @example
 * ```typescript
 * import { createPoolWithFallback, pool } from 'workerpool/modern';
 *
 * const executor = createPoolWithFallback(
 *   () => pool('./worker.js', { maxWorkers: 4 }),
 *   { methods: { add: (a, b) => a + b } }
 * );
 *
 * // Works in both environments
 * const result = await executor.exec('add', [1, 2]);
 * ```
 */
export function createPoolWithFallback<TPool>(
  poolFactory: () => TPool,
  fallbackOptions?: MainThreadExecutorOptions
): TPool | MainThreadExecutor {
  if (hasWorkerSupport()) {
    try {
      return poolFactory();
    } catch {
      // Fall through to fallback
    }
  }

  return new MainThreadExecutor(fallbackOptions);
}

/**
 * Create a MainThreadExecutor
 *
 * @param options - Executor options
 * @returns MainThreadExecutor instance
 */
export function mainThreadExecutor(
  options?: MainThreadExecutorOptions
): MainThreadExecutor {
  return new MainThreadExecutor(options);
}

export default MainThreadExecutor;

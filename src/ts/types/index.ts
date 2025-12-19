/**
 * workerpool TypeScript Type Definitions
 * Public API types for workerpool v11.0.0
 */

import type { ForkOptions } from 'child_process';
import type { WorkerOptions as NodeWorkerOptions } from 'worker_threads';

// Import core types for use in this file
import type { ExecOptions, WorkerpoolPromise } from './core';

// Re-export internal and message types for consumers who need them
export * from './core';
export * from './internal';
export * from './messages';
export * from './worker-methods';
export * from './parallel';
export * from './session';

/**
 * Worker type determines which backend is used for worker execution
 */
export type WorkerType = 'auto' | 'web' | 'process' | 'thread';

/**
 * Queue scheduling strategy
 */
export type QueueStrategy = 'fifo' | 'lifo';

/**
 * Web Worker options (browser environment)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
 */
export interface WebWorkerOptions {
  credentials?: RequestCredentials;
  name?: string;
  type?: 'classic' | 'module';
}

/**
 * Arguments passed to worker creation/termination callbacks
 */
export interface WorkerArg {
  /** Arguments passed to child_process.fork() */
  forkArgs?: string[];
  /** Options passed to child_process.fork() */
  forkOpts?: ForkOptions;
  /** Options passed to Web Worker constructor */
  workerOpts?: WebWorkerOptions;
  /** Options passed to worker_threads Worker constructor */
  workerThreadOpts?: NodeWorkerOptions;
  /** Path to the worker script */
  script?: string;
}

/**
 * Task queue interface for custom queue implementations
 * @template T - Task metadata type
 */
export interface TaskQueue<T = unknown> {
  /** Add a task to the queue */
  push(task: Task<T>): void;
  /** Remove and return the next task from the queue */
  pop(): Task<T> | undefined;
  /** Get the current number of tasks in the queue */
  size(): number;
  /** Check if a specific task is in the queue */
  contains(task: Task<T>): boolean;
  /** Remove all tasks from the queue */
  clear(): void;
}

/**
 * Pool configuration options
 */
export interface PoolOptions {
  /**
   * Minimum number of workers to keep initialized.
   * Set to 'max' to create maxWorkers on init.
   * @default 0
   */
  minWorkers?: number | 'max';

  /**
   * Maximum number of workers to create.
   * @default Number of CPUs - 1, minimum 1
   */
  maxWorkers?: number;

  /**
   * Maximum number of tasks allowed in the queue.
   * Throws error if exceeded.
   * @default Infinity
   */
  maxQueueSize?: number;

  /**
   * Worker backend type.
   * - 'auto': Web Workers in browser, worker_threads in Node.js 11.7+
   * - 'web': Browser Web Workers only
   * - 'process': Node.js child_process only
   * - 'thread': Node.js worker_threads only
   * @default 'auto'
   */
  workerType?: WorkerType;

  /**
   * Queue scheduling strategy or custom queue implementation.
   * - 'fifo': First in, first out (default)
   * - 'lifo': Last in, first out
   * - Custom TaskQueue object
   * @default 'fifo'
   */
  queueStrategy?: QueueStrategy | TaskQueue;

  /**
   * Path to worker script. If not provided, uses internal worker.
   */
  script?: string;

  /**
   * Timeout in ms to wait for worker cleanup before force termination.
   * @default 1000
   */
  workerTerminateTimeout?: number;

  /**
   * Arguments passed to child_process.fork() (process worker type only)
   */
  forkArgs?: string[];

  /**
   * Options passed to child_process.fork() (process worker type only)
   */
  forkOpts?: ForkOptions;

  /**
   * Options passed to Web Worker constructor (web worker type only)
   */
  workerOpts?: WebWorkerOptions;

  /**
   * Options passed to worker_threads Worker constructor (thread worker type only)
   */
  workerThreadOpts?: NodeWorkerOptions;

  /**
   * Capture stdout/stderr from workers and emit via events.
   * Not supported by 'web' worker type.
   * @default false
   */
  emitStdStreams?: boolean;

  /**
   * Callback invoked when a worker is being created.
   * Can return modified WorkerArg to override pool options for this worker.
   */
  onCreateWorker?: (arg: WorkerArg) => WorkerArg | void;

  /**
   * Callback invoked when a worker is being terminated.
   */
  onTerminateWorker?: (arg: WorkerArg) => void;

  /**
   * Starting port for debug port allocation.
   * @default 43210
   */
  debugPortStart?: number;

  /**
   * @deprecated Use workerType instead
   */
  nodeWorker?: string;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  /** Total number of workers (busy + idle) */
  totalWorkers: number;
  /** Number of workers currently executing tasks */
  busyWorkers: number;
  /** Number of workers available for tasks */
  idleWorkers: number;
  /** Number of tasks waiting in queue */
  pendingTasks: number;
  /** Number of tasks currently being executed */
  activeTasks: number;
}

/**
 * Options for worker registration in worker scripts
 */
export interface WorkerRegisterOptions {
  /**
   * Callback invoked when worker is being terminated.
   * Runs in worker context (unlike pool's onTerminateWorker).
   */
  onTerminate?: (code: number | undefined) => void | PromiseLike<void>;

  /**
   * Timeout in ms to wait for abort listener to resolve before force stop.
   * @default 1000
   */
  abortListenerTimeout?: number;
}

/**
 * Promise resolver object returned by Promise.defer()
 * @template T - Resolved value type
 */
export interface Resolver<T = unknown> {
  promise: WorkerpoolPromise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: Error) => void;
}

/**
 * Task object in the queue
 * @template T - Task metadata type
 */
export interface Task<T = unknown> {
  /** Method name or function to execute */
  method: string | Function;
  /** Parameters to pass to the method */
  params?: unknown[];
  /** Promise resolver for task result */
  resolver: Resolver<unknown>;
  /** Task timeout in milliseconds, null for no timeout */
  timeout: number | null;
  /** Execution options */
  options?: ExecOptions<T>;
}

/**
 * Proxy type that wraps worker methods with promise-returning versions
 * @template T - Object with worker methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkerProxy<T extends Record<string, (...args: any[]) => any>> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => WorkerpoolPromise<ReturnType<T[K]>>;
};

/**
 * Transfer wrapper for transferable objects
 */
export interface TransferDescriptor<T = unknown> {
  message: T;
  transfer: Transferable[];
}

/**
 * Affinity hint for task execution (Sprint 5)
 */
export interface AffinityHint {
  /** Affinity key (e.g., 'user:123', 'file:/path/to/file') */
  key: string;
  /** Affinity strategy: 'none' | 'preferred' | 'strict' | 'spread' */
  strategy?: 'none' | 'preferred' | 'strict' | 'spread';
  /** Maximum wait time for preferred/strict affinity (ms) */
  maxWaitTime?: number;
}

/**
 * Extended execution options with affinity support
 */
export interface ExecOptionsWithAffinity<T = unknown> extends ExecOptions<T> {
  /** Affinity hint for worker selection */
  affinity?: AffinityHint;
}

/**
 * Extended pool options with Sprint 5 features
 */
export interface PoolOptionsExtended extends PoolOptions {
  /** Enable worker pre-warming */
  preWarm?: boolean;
  /** Idle timeout before worker recycling (ms) */
  idleTimeout?: number;
  /** Maximum tasks per worker before recycling */
  maxTasksPerWorker?: number;
  /** Enable adaptive scaling */
  adaptiveScaling?: boolean;
  /** Health check interval (ms) */
  healthCheckInterval?: number;
  /** Maximum consecutive failures before worker replacement */
  maxConsecutiveFailures?: number;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Metrics export callback */
  onMetrics?: (metrics: PoolMetricsSnapshot) => void;
  /** Metrics export interval (ms) */
  metricsInterval?: number;
}

/**
 * Pool metrics snapshot (from MetricsCollector)
 */
export interface PoolMetricsSnapshot {
  /** Timestamp of metrics collection */
  timestamp: number;
  /** Summary statistics */
  summary: {
    totalWorkers: number;
    busyWorkers: number;
    idleWorkers: number;
    tasksPerSecond: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
  };
  /** Queue metrics */
  queue: {
    depth: number;
    peakDepth: number;
    totalEnqueued: number;
    totalDequeued: number;
    avgWaitTime: number;
  };
}

// =============================================================================
// Sprint 7: Batch Operations & SIMD Types
// =============================================================================

/**
 * Options for batch task execution
 */
export interface BatchOptions {
  /**
   * Maximum number of concurrent tasks to execute.
   * @default Number of workers
   */
  concurrency?: number;

  /**
   * Stop execution on first failure.
   * If false, continues with remaining tasks and collects all failures.
   * @default false
   */
  failFast?: boolean;

  /**
   * Progress callback invoked after each task completion.
   */
  onProgress?: (progress: BatchProgress) => void;

  /**
   * Minimum interval between progress callbacks (ms).
   * Useful to reduce overhead when processing many tasks.
   * @default 0 (every completion)
   */
  progressThrottle?: number;

  /**
   * Timeout for each individual task (ms).
   * @default undefined (no timeout)
   */
  taskTimeout?: number;

  /**
   * Timeout for entire batch operation (ms).
   * @default undefined (no timeout)
   */
  batchTimeout?: number;

  /**
   * Transferable objects for batch execution.
   */
  transfer?: Transferable[];
}

/**
 * Progress information for batch execution
 */
export interface BatchProgress {
  /** Number of tasks completed (success + failure) */
  completed: number;
  /** Total number of tasks in batch */
  total: number;
  /** Number of successful tasks */
  successes: number;
  /** Number of failed tasks */
  failures: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Estimated time remaining (ms) */
  estimatedRemaining?: number;
  /** Current throughput (tasks/second) */
  throughput?: number;
}

/**
 * Result of individual task in a batch
 * @template T - Result value type
 */
export interface BatchTaskResult<T> {
  /** Task index in the batch */
  index: number;
  /** Whether the task succeeded */
  success: boolean;
  /** Result value (if success) */
  result?: T;
  /** Error (if failed) */
  error?: Error;
  /** Execution duration (ms) */
  duration: number;
}

/**
 * Result of batch execution
 * @template T - Result value type
 */
export interface BatchResult<T> {
  /** Results for each task (in order) */
  results: BatchTaskResult<T>[];
  /** Array of successful results only */
  successes: T[];
  /** Array of errors only */
  failures: Error[];
  /** Total batch execution duration (ms) */
  duration: number;
  /** Number of successful tasks */
  successCount: number;
  /** Number of failed tasks */
  failureCount: number;
  /** Whether all tasks succeeded */
  allSucceeded: boolean;
  /** Whether batch was cancelled */
  cancelled: boolean;
}

/**
 * Batch task descriptor
 * @template P - Parameters type
 */
export interface BatchTask<P extends unknown[] = unknown[]> {
  /** Method name or function to execute */
  method: string | ((...args: P) => unknown);
  /** Parameters for the task */
  params: P;
  /** Per-task execution options */
  options?: ExecOptions;
}

/**
 * Options for parallel map operation
 * @template T - Input element type
 * @template R - Result element type
 */
export interface MapOptions<T, R> extends Omit<BatchOptions, 'onProgress'> {
  /**
   * Chunk size for distributing work.
   * Larger chunks reduce overhead but may cause uneven distribution.
   * @default Math.ceil(items.length / workers)
   */
  chunkSize?: number;

  /**
   * Progress callback for map operation.
   */
  onProgress?: (progress: MapProgress<R>) => void;
}

/**
 * Progress information for map operation
 * @template R - Result element type
 */
export interface MapProgress<R> extends BatchProgress {
  /** Partial results collected so far */
  partialResults: (R | undefined)[];
}

/**
 * Cancellable batch promise
 * @template T - Result type
 */
export interface BatchPromise<T> extends WorkerpoolPromise<BatchResult<T>> {
  /**
   * Cancel all pending tasks in the batch.
   * Already completed tasks are preserved in the result.
   */
  cancel(): this;

  /**
   * Pause batch execution.
   * Queued tasks are held, in-progress tasks continue.
   */
  pause(): this;

  /**
   * Resume paused batch execution.
   */
  resume(): this;

  /**
   * Check if batch is paused.
   */
  isPaused(): boolean;
}

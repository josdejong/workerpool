/**
 * workerpool TypeScript Type Definitions
 * Public API types for workerpool v11.0.0
 */

import type { ForkOptions } from 'child_process';
import type { WorkerOptions as NodeWorkerOptions } from 'worker_threads';

// Re-export internal and message types for consumers who need them
export * from './internal';
export * from './messages';
export * from './worker-methods';

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
 * Options for task execution
 * @template T - Task metadata type
 */
export interface ExecOptions<T = unknown> {
  /**
   * Event listener for worker-emitted events during execution
   */
  on?: (payload: unknown) => void;

  /**
   * Transferable objects to send to worker (zero-copy transfer).
   * Not supported by 'process' worker type.
   */
  transfer?: Transferable[];

  /**
   * Custom metadata attached to the task.
   * Useful for custom queue implementations (e.g., priority).
   */
  metadata?: T;
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
 * Workerpool Promise interface with cancel and timeout support
 * @template T - Resolved value type
 * @template E - Error type
 */
export interface WorkerpoolPromise<T, E = unknown> extends Promise<T> {
  /** Whether the promise has been resolved */
  readonly resolved: boolean;
  /** Whether the promise has been rejected */
  readonly rejected: boolean;
  /** Whether the promise is still pending */
  readonly pending: boolean;

  /**
   * Cancel the promise, rejecting with CancellationError
   */
  cancel(): this;

  /**
   * Set a timeout for the promise.
   * Rejects with TimeoutError if not resolved within delay.
   * @param delay - Timeout in milliseconds
   */
  timeout(delay: number): this;

  /**
   * Execute callback when promise resolves or rejects
   * @deprecated Use finally() instead
   */
  always<TResult>(fn: () => TResult | PromiseLike<TResult>): WorkerpoolPromise<TResult, unknown>;
}

/**
 * Proxy type that wraps worker methods with promise-returning versions
 * @template T - Object with worker methods
 */
export type WorkerProxy<T extends Record<string, (...args: unknown[]) => unknown>> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => WorkerpoolPromise<ReturnType<T[K]>>;
};

/**
 * Transfer wrapper for transferable objects
 */
export interface TransferDescriptor<T = unknown> {
  message: T;
  transfer: Transferable[];
}

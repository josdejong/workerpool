/**
 * Pool - Worker pool manager
 *
 * Manages a pool of workers for executing tasks in parallel.
 * Handles worker lifecycle, task queuing, and load balancing.
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
} from '../types/index';

/** Global debug port allocator */
const DEBUG_PORT_ALLOCATOR = new DebugPortAllocator();

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

// Use WorkerArg from types for callbacks

/**
 * Pool - Manages a pool of workers
 */
export class Pool<TMetadata = unknown> {
  /** Path to worker script */
  readonly script: string | null;

  /** All workers in the pool */
  private workers: WorkerHandler[] = [];

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

  constructor(script?: string | PoolOptions, options?: PoolOptions) {
    // Handle overloaded constructor
    if (typeof script === 'string') {
      this.script = script || null;
    } else {
      this.script = null;
      options = script;
    }

    options = options || {};

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
  }

  /**
   * Execute a method on a worker
   *
   * @param method - Method name or function to execute
   * @param params - Parameters to pass to the method
   * @param options - Execution options
   * @returns Promise resolving to the result
   */
  exec<T = unknown>(
    method: string | ((...args: unknown[]) => T),
    params?: unknown[],
    options?: ExecOptions<TMetadata>
  ): WorkerpoolPromise<T, Error> {
    if (params && !Array.isArray(params)) {
      throw new TypeError('Array expected as argument "params"');
    }

    if (typeof method === 'string') {
      const resolver = WorkerpoolPromise.defer<T>();

      if (this.taskQueue.size() >= this.maxQueueSize) {
        throw new Error('Max queue size of ' + this.maxQueueSize + ' reached');
      }

      const task: Task<TMetadata> = {
        method,
        params: params || [],
        resolver: resolver as Resolver<unknown>,
        timeout: null,
        options,
      };

      this.taskQueue.push(task);

      // Override timeout to start when task actually executes
      const originalTimeout = resolver.promise.timeout.bind(resolver.promise);
      const taskQueue = this.taskQueue;
      const promise = resolver.promise as WorkerpoolPromise<T, unknown>;

      (promise as { timeout: (delay: number) => WorkerpoolPromise<T, unknown> }).timeout = function timeout(delay: number): WorkerpoolPromise<T, unknown> {
        if (taskQueue.contains(task)) {
          task.timeout = delay;
          return promise;
        } else {
          return originalTimeout(delay) as WorkerpoolPromise<T, unknown>;
        }
      };

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
  proxy<T extends Record<string, (...args: unknown[]) => unknown>>(): WorkerpoolPromise<
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
   *
   * @param force - If true, terminate immediately without waiting for tasks
   * @param timeout - Timeout for termination
   * @returns Promise resolving when all workers terminated
   */
  terminate(force?: boolean, timeout?: number): WorkerpoolPromise<void[], unknown> {
    const me = this;

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
  stats(): PoolStats {
    const totalWorkers = this.workers.length;
    const busyWorkers = this.workers.filter((worker) => worker.busy()).length;

    return {
      totalWorkers,
      busyWorkers,
      idleWorkers: totalWorkers - busyWorkers,
      pendingTasks: this.taskQueue.size(),
      activeTasks: busyWorkers,
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
}

export { TerminateError };
export default Pool;

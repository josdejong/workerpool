/**
 * workerpool - A thread pool library for Node.js and the browser
 *
 * Offloads CPU-intensive tasks to worker processes/threads.
 *
 * @packageDocumentation
 */

import { platform, isMainThread, cpus } from './platform/environment';
import { Pool, TerminateError } from './core/Pool';
import { WorkerpoolPromise, CancellationError, TimeoutError } from './core/Promise';
import Transfer from './platform/transfer';
import { add, emit } from './workers/worker';

import type { PoolOptions, ExecOptions, PoolStats, WorkerProxy } from './types/index';

// Backwards compatibility alias
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Proxy<T extends Record<string, (...args: any[]) => any>> = WorkerProxy<T>;
import type { WorkerRegisterOptions } from './workers/worker';
import type { WorkerType } from './core/WorkerHandler';

/**
 * Create a new worker pool
 *
 * @param script - Path to worker script (optional)
 * @param options - Pool configuration options
 * @returns New Pool instance
 *
 * @example
 * ```typescript
 * // Create pool with default worker
 * const pool = workerpool.pool();
 *
 * // Create pool with custom script
 * const pool = workerpool.pool('./worker.js');
 *
 * // Create pool with options
 * const pool = workerpool.pool({ maxWorkers: 4 });
 * ```
 */
export function pool(script?: string | PoolOptions, options?: PoolOptions): Pool {
  return new Pool(script, options);
}

/**
 * Register methods on the current worker
 *
 * @param methods - Object containing methods to register
 * @param options - Worker options
 *
 * @example
 * ```typescript
 * // worker.js
 * workerpool.worker({
 *   fibonacci: function(n) {
 *     if (n <= 1) return n;
 *     return fibonacci(n - 1) + fibonacci(n - 2);
 *   }
 * });
 * ```
 */
export function worker(
  methods?: Record<string, (...args: unknown[]) => unknown>,
  options?: WorkerRegisterOptions
): void {
  add(methods, options);
}

/**
 * Emit an event from worker to pool
 *
 * @param payload - Event payload to send
 *
 * @example
 * ```typescript
 * // Inside worker
 * workerpool.workerEmit({ progress: 50 });
 * ```
 */
export function workerEmit(payload: unknown): void {
  emit(payload);
}

// Export Promise class and error types
export { WorkerpoolPromise as Promise };
export { CancellationError, TimeoutError };

// Export Transfer utility
export { Transfer };

// Export platform info
export { platform, isMainThread, cpus };

// Export error types
export { TerminateError };

// Export Pool class for direct instantiation
export { Pool };

// Re-export types
export type {
  PoolOptions,
  ExecOptions,
  PoolStats,
  WorkerProxy,
  WorkerType,
  WorkerRegisterOptions,
  Proxy,
};

// Default export for CommonJS compatibility
export default {
  pool,
  worker,
  workerEmit,
  Promise: WorkerpoolPromise,
  Transfer,
  platform,
  isMainThread,
  cpus,
  TerminateError,
  Pool,
};

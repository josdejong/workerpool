/**
 * Workerpool Minimal Build Entry Point
 *
 * A lightweight version of workerpool (~5KB minified) that includes only
 * the core functionality without WASM support.
 *
 * Use this when:
 * - You don't need WASM-accelerated queues
 * - You want the smallest possible bundle size
 * - You're targeting environments without WebAssembly
 *
 * @example
 * ```typescript
 * // ESM import
 * import { pool, worker, Transfer } from 'workerpool/minimal';
 *
 * // Or CommonJS
 * const workerpool = require('workerpool/minimal');
 * ```
 *
 * @module workerpool/minimal
 */

// Import TypeScript modules
import { Pool } from './core/Pool';
import { add as workerAdd, emit as workerEmitFn } from './workers/worker';
import { WorkerpoolPromise } from './core/Promise';
import Transfer from './platform/transfer';
import { platform, isMainThread, cpus } from './platform/environment';

// Re-export types
export type {
  PoolOptions,
  ExecOptions,
  PoolStats,
  WorkerType,
  QueueStrategy,
  WorkerpoolPromise as WorkerpoolPromiseType,
  WorkerProxy,
  Task,
  TaskQueue,
} from './types/index';

// Core pool function
export function pool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): Pool {
  return new Pool(script as string | undefined, options);
}

// Worker registration function
export function worker(methods?: Record<string, (...args: unknown[]) => unknown>, options?: object): void {
  workerAdd(methods, options);
}

// Worker emit function
export function workerEmit(payload: unknown): void {
  workerEmitFn(payload);
}

// Promise implementation
export const Promise = WorkerpoolPromise;

// Transfer utility - re-export
export { Transfer };

// Platform detection - re-export
export { platform, isMainThread, cpus };

// Error classes (essential only)
export {
  CancellationError,
  TimeoutError,
  TerminationError,
} from './errors';

/**
 * Package metadata
 */
export const VERSION = '__VERSION__';
export const BUILD_TYPE = 'minimal' as const;

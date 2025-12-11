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

// Import CommonJS modules
import Pool from './Pool';
import workerModule from './worker';
import PromiseModule from './Promise';
import TransferModule from './transfer';
import environment from './environment';

// Re-export types
export type {
  PoolOptions,
  ExecOptions,
  PoolStats,
  WorkerType,
  QueueStrategy,
  WorkerpoolPromise,
  WorkerProxy,
  Task,
  TaskQueue,
} from './types/index';

// Core pool function
export function pool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): InstanceType<typeof Pool> {
  return new Pool(script as string | undefined, options);
}

// Worker registration function
export function worker(methods?: Record<string, (...args: unknown[]) => unknown>, options?: object): void {
  workerModule.add(methods, options);
}

// Worker emit function
export function workerEmit(payload: unknown): void {
  workerModule.emit(payload);
}

// Promise implementation
export const Promise = PromiseModule.Promise;

// Transfer utility
export const Transfer = TransferModule;

// Platform detection
export const platform = environment.platform;
export const isMainThread = environment.isMainThread;
export const cpus = environment.cpus;

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

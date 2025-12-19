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
import {
  platform,
  isMainThread,
  cpus,
  isNode,
  getPlatformInfo,
  hasWorkerThreads,
  hasSharedArrayBuffer,
  hasAtomics,
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
} from './platform/environment';

// Import circular buffer utilities
import {
  CircularBuffer,
  GrowableCircularBuffer,
  TimeWindowBuffer,
} from './core/circular-buffer';

// Import queue implementations
import { FIFOQueue, LIFOQueue } from './core/TaskQueue';

// ============================================================================
// Type Exports
// ============================================================================

// Re-export core types
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
  Resolver,
  TransferDescriptor,
  WorkerArg,
  WebWorkerOptions,
  WorkerRegisterOptions,
} from './types/index';

// Re-export batch types (commonly needed even in minimal builds)
export type {
  BatchOptions,
  BatchProgress,
  BatchResult,
  BatchTaskResult,
  BatchTask,
  MapOptions,
  MapProgress,
  BatchPromise,
  AffinityHint,
  ExecOptionsWithAffinity,
  PoolOptionsExtended,
  PoolMetricsSnapshot,
} from './types/index';

// Re-export platform types
export type {
  PlatformInfo,
  WorkerTypeSupport,
} from './types/internal';

// Re-export circular buffer types
export type { TimestampedValue } from './core/circular-buffer';

// ============================================================================
// Core APIs
// ============================================================================

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
export function pool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): Pool {
  return new Pool(script as string | undefined, options);
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
export function worker(methods?: Record<string, (...args: unknown[]) => unknown>, options?: object): void {
  workerAdd(methods, options);
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
  workerEmitFn(payload);
}

// Promise implementation
export const Promise = WorkerpoolPromise;

// Transfer utility - re-export
export { Transfer };

// ============================================================================
// Platform Detection
// ============================================================================

// Basic platform info
export { platform, isMainThread, cpus };

// Extended platform detection
export {
  isNode,
  getPlatformInfo,
  hasWorkerThreads,
  hasSharedArrayBuffer,
  hasAtomics,
};

// Bun compatibility utilities
export {
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
};

// ============================================================================
// Data Structures
// ============================================================================

/**
 * High-performance O(1) circular buffer with automatic eviction.
 * Use for metrics collection, sliding windows, and fixed-size queues.
 *
 * @example
 * ```typescript
 * const buffer = new CircularBuffer<number>(1000);
 * buffer.push(42); // O(1), evicts oldest if full
 * const values = buffer.toArray();
 * ```
 */
export { CircularBuffer };

/**
 * Growable circular buffer that doubles in size instead of evicting.
 * Ideal for task queues where no data should be lost.
 *
 * @example
 * ```typescript
 * const queue = new GrowableCircularBuffer<Task>();
 * queue.push(task); // O(1) amortized
 * const next = queue.shift(); // O(1)
 * ```
 */
export { GrowableCircularBuffer };

/**
 * Time-windowed buffer for metrics collection.
 * Automatically filters values outside the time window.
 *
 * @example
 * ```typescript
 * const buffer = new TimeWindowBuffer<number>(60000); // 1 minute window
 * buffer.push(latency);
 * const recentValues = buffer.getValues();
 * ```
 */
export { TimeWindowBuffer };

// ============================================================================
// Queue Implementations
// ============================================================================

/**
 * FIFO (First-In-First-Out) task queue implementation.
 * Uses GrowableCircularBuffer for O(1) operations.
 */
export { FIFOQueue };

/**
 * LIFO (Last-In-First-Out) task queue implementation.
 * Uses array with O(1) push/pop.
 */
export { LIFOQueue };

// ============================================================================
// Error Classes
// ============================================================================

export {
  CancellationError,
  TimeoutError,
  TerminationError,
} from './errors';

// ============================================================================
// Pool Class Export
// ============================================================================

/**
 * Pool class for direct instantiation
 */
export { Pool };

// ============================================================================
// Metadata
// ============================================================================

/**
 * Package version
 */
export const VERSION = '__VERSION__';

/**
 * Build type identifier
 */
export const BUILD_TYPE = 'minimal' as const;

// ============================================================================
// Default Export
// ============================================================================

export default {
  pool,
  worker,
  workerEmit,
  Promise: WorkerpoolPromise,
  Transfer,
  Pool,
  // Platform detection
  platform,
  isMainThread,
  cpus,
  isNode,
  getPlatformInfo,
  hasWorkerThreads,
  hasSharedArrayBuffer,
  hasAtomics,
  // Bun compatibility
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
  // Data structures
  CircularBuffer,
  GrowableCircularBuffer,
  TimeWindowBuffer,
  // Queue implementations
  FIFOQueue,
  LIFOQueue,
  // Metadata
  VERSION,
  BUILD_TYPE,
};

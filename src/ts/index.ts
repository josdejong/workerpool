/**
 * workerpool - A thread pool library for Node.js and the browser
 *
 * Offloads CPU-intensive tasks to worker processes/threads.
 *
 * @packageDocumentation
 */

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
import type { PlatformInfo, WorkerTypeSupport } from './types/internal';
import {
  Pool,
  PoolEnhanced,
  TerminateError,
  getSharedPool,
  terminateSharedPool,
  hasSharedPool,
} from './core/Pool';
import type {
  EnhancedPoolOptions,
  EnhancedExecOptions,
  EnhancedPoolStats,
  PoolEvents,
  PoolEventListener,
  CircuitBreakerOptions,
  RetryOptions,
  MemoryOptions,
  HealthCheckOptions,
} from './core/Pool';
import { WorkerpoolPromise, CancellationError, TimeoutError } from './core/Promise';
import Transfer from './platform/transfer';
import { add, emit } from './workers/worker';
import { capabilities, getCapabilities, canUseOptimalTransfer, canUseZeroCopy, getCapabilityReport } from './platform/capabilities';
import { resolveWorkerUrl, createWorkerBlobUrl, revokeWorkerBlobUrl, getWorkerConfig, supportsWorkerModules } from './platform/worker-url';
import { serializeBinary, deserializeBinary, shouldUseBinarySerialization, estimateBinarySize } from './core/binary-serializer';

// Import circular buffer utilities
import {
  CircularBuffer,
  GrowableCircularBuffer,
  TimeWindowBuffer,
} from './core/circular-buffer';

// Import queue implementations
import { FIFOQueue, LIFOQueue } from './core/TaskQueue';

// Import transfer detection utilities
import {
  isTransferable,
  detectTransferables,
  getTransferableType,
  validateTransferables,
  TransferableType,
} from './platform/transfer-detection';

// Import metrics collector
import { MetricsCollector } from './core/metrics';

// Import parallel processing
import {
  createParallelReduce,
  createParallelForEach,
  createParallelFilter,
  createParallelSome,
  createParallelEvery,
  createParallelFind,
  createParallelFindIndex,
  createParallelCount,
  createParallelPartition,
  createParallelIncludes,
  createParallelIndexOf,
  createParallelGroupBy,
  createParallelFlatMap,
  createParallelUnique,
  createParallelReduceRight,
} from './core/parallel-processing';

// Import main thread executor for graceful degradation
import {
  MainThreadExecutor,
  hasWorkerSupport,
  createPoolWithFallback,
  mainThreadExecutor,
} from './core/main-thread-executor';

// Import session manager
import { SessionManager } from './core/session-manager';

import type { PoolOptions, ExecOptions, PoolStats, WorkerProxy } from './types/index';
import type { Capabilities } from './platform/capabilities';
import type { BinarySerializedData } from './core/binary-serializer';
import type { WorkerConfig, WorkerConfigOptions } from './platform/worker-url';
import type { TimestampedValue } from './core/circular-buffer';
import type {
  PoolMetrics,
  LatencyHistogram,
  WorkerUtilization,
  QueueMetrics,
  ErrorMetrics,
  MetricsCollectorOptions,
} from './core/metrics';
import type { MainThreadExecutorOptions } from './core/main-thread-executor';
import type {
  ParallelOptions,
  ReduceOptions,
  FindOptions,
  PredicateOptions,
  FilterResult,
  FindResult,
  ReduceResult,
  PredicateResult,
  ForEachResult,
  ParallelPromise,
  MapperFn,
  ReducerFn,
  CombinerFn,
  PredicateFn,
  ConsumerFn,
  KeySelectorFn,
  FlatMapFn,
  EqualityFn,
  UniqueOptions,
  GroupByOptions,
  FlatMapOptions,
  CountResult,
  PartitionResult,
  GroupByResult,
  UniqueResult,
} from './types/parallel';
import type {
  Session,
  SessionOptions,
  SessionStats,
  SessionState,
  SessionExecOptions,
  WorkerSessionAPI,
} from './types/session';

// Backwards compatibility alias
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Proxy<T extends Record<string, (...args: any[]) => any>> = WorkerProxy<T>;
import type { WorkerRegisterOptions } from './workers/worker';
import type { WorkerType } from './core/WorkerHandler';

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
export { isBun, bunVersion, recommendedWorkerType, getWorkerTypeSupport, isWorkerTypeSupported };

// ============================================================================
// Error Types
// ============================================================================

export { TerminateError };

// ============================================================================
// Pool Classes and Utilities
// ============================================================================

// Export Pool classes for direct instantiation
export { Pool, PoolEnhanced };

// Export shared pool utilities
export { getSharedPool, terminateSharedPool, hasSharedPool };

// ============================================================================
// Capabilities API
// ============================================================================

export { capabilities, getCapabilities, canUseOptimalTransfer, canUseZeroCopy, getCapabilityReport };

// ============================================================================
// Worker URL Utilities
// ============================================================================

export { resolveWorkerUrl, createWorkerBlobUrl, revokeWorkerBlobUrl, getWorkerConfig, supportsWorkerModules };

// ============================================================================
// Binary Serialization
// ============================================================================

export { serializeBinary, deserializeBinary, shouldUseBinarySerialization, estimateBinarySize };

// ============================================================================
// Transfer Detection Utilities
// ============================================================================

/**
 * Check if a value can be transferred (zero-copy) to a worker
 *
 * @param value - Value to check
 * @returns True if the value is transferable
 *
 * @example
 * ```typescript
 * const buffer = new ArrayBuffer(1024);
 * if (isTransferable(buffer)) {
 *   pool.exec('process', [buffer], { transfer: [buffer] });
 * }
 * ```
 */
export { isTransferable };

/**
 * Detect all transferable objects within a value (recursively)
 *
 * @param value - Value to scan for transferables
 * @returns Array of transferable objects found
 *
 * @example
 * ```typescript
 * const data = { buffer: new ArrayBuffer(1024), name: 'test' };
 * const transferables = detectTransferables(data);
 * pool.exec('process', [data], { transfer: transferables });
 * ```
 */
export { detectTransferables };

/**
 * Get the type of a transferable object
 */
export { getTransferableType };

/**
 * Validate a list of transferable objects
 */
export { validateTransferables };

/**
 * Enum of transferable object types
 */
export type { TransferableType };

// ============================================================================
// Data Structures
// ============================================================================

/**
 * High-performance O(1) circular buffer with automatic eviction.
 * Use for metrics collection, sliding windows, and fixed-size queues.
 */
export { CircularBuffer };

/**
 * Growable circular buffer that doubles in size instead of evicting.
 * Ideal for task queues where no data should be lost.
 */
export { GrowableCircularBuffer };

/**
 * Time-windowed buffer for metrics collection.
 * Automatically filters values outside the time window.
 */
export { TimeWindowBuffer };

// ============================================================================
// Queue Implementations
// ============================================================================

/**
 * FIFO (First-In-First-Out) task queue implementation.
 */
export { FIFOQueue };

/**
 * LIFO (Last-In-First-Out) task queue implementation.
 */
export { LIFOQueue };

// ============================================================================
// Metrics
// ============================================================================

/**
 * Pool metrics collector for monitoring performance.
 * Collects latency histograms, worker utilization, queue depths, and error rates.
 */
export { MetricsCollector };

// ============================================================================
// Graceful Degradation (Main Thread Fallback)
// ============================================================================

/**
 * Main thread executor for environments without Web Worker support.
 * Provides the same API as Pool but executes on the main thread.
 */
export { MainThreadExecutor };

/**
 * Check if Web Workers are supported in the current environment
 */
export { hasWorkerSupport };

/**
 * Create either a Pool or MainThreadExecutor based on environment capabilities.
 * Falls back to main thread execution when workers aren't available.
 */
export { createPoolWithFallback };

/**
 * Create a MainThreadExecutor instance
 */
export { mainThreadExecutor };

// ============================================================================
// Session Support
// ============================================================================

/**
 * Session manager for stateful worker tasks.
 * Manages worker affinity and session lifecycle.
 */
export { SessionManager };

// ============================================================================
// Parallel Processing Utilities
// ============================================================================

/**
 * Lower-level parallel processing functions for custom implementations.
 */
export {
  createParallelReduce,
  createParallelForEach,
  createParallelFilter,
  createParallelSome,
  createParallelEvery,
  createParallelFind,
  createParallelFindIndex,
  createParallelCount,
  createParallelPartition,
  createParallelIncludes,
  createParallelIndexOf,
  createParallelGroupBy,
  createParallelFlatMap,
  createParallelUnique,
  createParallelReduceRight,
};

// ============================================================================
// Type Exports
// ============================================================================

// Re-export core types
export type {
  PoolOptions,
  ExecOptions,
  PoolStats,
  WorkerProxy,
  WorkerType,
  WorkerRegisterOptions,
  Proxy,
  // Enhanced pool types
  Capabilities,
  EnhancedPoolOptions,
  EnhancedExecOptions,
  EnhancedPoolStats,
  PoolEvents,
  PoolEventListener,
  CircuitBreakerOptions,
  RetryOptions,
  MemoryOptions,
  HealthCheckOptions,
  BinarySerializedData,
  WorkerConfig,
  WorkerConfigOptions,
  // Platform types
  PlatformInfo,
  WorkerTypeSupport,
  // Circular buffer types
  TimestampedValue,
  // Metrics types
  PoolMetrics,
  LatencyHistogram,
  WorkerUtilization,
  QueueMetrics,
  ErrorMetrics,
  MetricsCollectorOptions,
  // Graceful degradation types
  MainThreadExecutorOptions,
  // Parallel processing types
  ParallelOptions,
  ReduceOptions,
  FindOptions,
  PredicateOptions,
  FilterResult,
  FindResult,
  ReduceResult,
  PredicateResult,
  ForEachResult,
  ParallelPromise,
  MapperFn,
  ReducerFn,
  CombinerFn,
  PredicateFn,
  ConsumerFn,
  KeySelectorFn,
  FlatMapFn,
  EqualityFn,
  UniqueOptions,
  GroupByOptions,
  FlatMapOptions,
  CountResult,
  PartitionResult,
  GroupByResult,
  UniqueResult,
  // Session types
  Session,
  SessionOptions,
  SessionStats,
  SessionState,
  SessionExecOptions,
  WorkerSessionAPI,
};

// Re-export batch types
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
  Task,
  TaskQueue,
  Resolver,
  TransferDescriptor,
  WorkerArg,
  WebWorkerOptions,
  QueueStrategy,
} from './types/index';

// ============================================================================
// Enhanced Pool Factory Functions
// ============================================================================

/**
 * Create an enhanced pool with advanced features
 *
 * @param script - Path to worker script (optional)
 * @param options - Enhanced pool configuration options
 * @returns New PoolEnhanced instance
 *
 * @example
 * ```typescript
 * // Create enhanced pool with eager initialization
 * const pool = workerpool.enhancedPool('./worker.js', {
 *   eagerInit: true,
 *   dataTransfer: 'auto',
 *   retry: { maxRetries: 3 },
 *   circuitBreaker: { enabled: true }
 * });
 *
 * // Wait for workers to be ready
 * await pool.ready;
 *
 * // Execute with events
 * pool.on('taskComplete', (e) => console.log(`Task ${e.taskId} done in ${e.duration}ms`));
 * ```
 */
export function enhancedPool(script?: string | EnhancedPoolOptions, options?: EnhancedPoolOptions): Pool {
  return new Pool(script, options);
}

/**
 * Create a pool with optimal settings for the current runtime
 *
 * Automatically selects the best worker type for the platform:
 * - Bun: Uses 'thread' (worker_threads) due to IPC issues with child_process
 * - Node.js: Uses 'auto' (will select thread or process based on availability)
 * - Browser: Uses 'web' (Web Workers)
 *
 * @param script - Path to worker script (optional)
 * @param options - Pool configuration options (workerType will be overridden)
 * @returns New Pool instance with optimal settings
 *
 * @example
 * ```typescript
 * // Create optimally configured pool
 * const pool = workerpool.optimalPool('./worker.js');
 *
 * // Works correctly in Node.js, Bun, and browsers
 * const result = await pool.exec('myMethod', [arg1, arg2]);
 * ```
 */
export function optimalPool(script?: string | PoolOptions, options?: PoolOptions): Pool {
  const baseOptions: PoolOptions = typeof script === 'object' ? script : (options || {});
  const scriptPath = typeof script === 'string' ? script : undefined;

  const optimalOptions: PoolOptions = {
    ...baseOptions,
    workerType: recommendedWorkerType,
    maxWorkers: baseOptions.maxWorkers ?? Math.max((cpus || 4) - 1, 1),
  };

  return new Pool(scriptPath, optimalOptions);
}

/**
 * Get runtime information for diagnostics
 *
 * @returns Object with runtime details
 *
 * @example
 * ```typescript
 * const info = workerpool.getRuntimeInfo();
 * console.log(info);
 * // {
 * //   runtime: 'bun',  // or 'node' or 'browser'
 * //   version: '1.3.4', // runtime version
 * //   recommendedWorkerType: 'thread',
 * //   workerTypeSupport: { thread: true, process: false, web: false, auto: true }
 * // }
 * ```
 */
export function getRuntimeInfo(): {
  runtime: 'bun' | 'node' | 'browser';
  version: string | null;
  recommendedWorkerType: string;
  workerTypeSupport: WorkerTypeSupport;
} {
  let runtime: 'bun' | 'node' | 'browser';
  let version: string | null = null;

  if (platform === 'browser') {
    runtime = 'browser';
  } else if (isBun) {
    runtime = 'bun';
    version = bunVersion;
  } else {
    runtime = 'node';
    version = typeof process !== 'undefined' ? process.version : null;
  }

  return {
    runtime,
    version,
    recommendedWorkerType,
    workerTypeSupport: getWorkerTypeSupport(),
  };
}

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
export const BUILD_TYPE = 'modern' as const;

// ============================================================================
// Default Export
// ============================================================================

// Default export for CommonJS compatibility
export default {
  pool,
  enhancedPool,
  optimalPool,
  worker,
  workerEmit,
  Promise: WorkerpoolPromise,
  Transfer,
  platform,
  isMainThread,
  cpus,
  TerminateError,
  Pool,
  PoolEnhanced,
  // Shared pool
  getSharedPool,
  terminateSharedPool,
  hasSharedPool,
  // Capabilities
  capabilities,
  getCapabilities,
  canUseOptimalTransfer,
  canUseZeroCopy,
  getCapabilityReport,
  // Worker URL
  resolveWorkerUrl,
  createWorkerBlobUrl,
  revokeWorkerBlobUrl,
  getWorkerConfig,
  supportsWorkerModules,
  // Binary serialization
  serializeBinary,
  deserializeBinary,
  shouldUseBinarySerialization,
  estimateBinarySize,
  // Platform detection
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
  getRuntimeInfo,
  // Transfer detection
  isTransferable,
  detectTransferables,
  getTransferableType,
  validateTransferables,
  // Data structures
  CircularBuffer,
  GrowableCircularBuffer,
  TimeWindowBuffer,
  // Queue implementations
  FIFOQueue,
  LIFOQueue,
  // Metrics
  MetricsCollector,
  // Graceful degradation
  MainThreadExecutor,
  hasWorkerSupport,
  createPoolWithFallback,
  mainThreadExecutor,
  // Session support
  SessionManager,
  // Parallel processing utilities
  createParallelReduce,
  createParallelForEach,
  createParallelFilter,
  createParallelSome,
  createParallelEvery,
  createParallelFind,
  createParallelFindIndex,
  createParallelCount,
  createParallelPartition,
  createParallelIncludes,
  createParallelIndexOf,
  createParallelGroupBy,
  createParallelFlatMap,
  createParallelUnique,
  createParallelReduceRight,
  // Metadata
  VERSION,
  BUILD_TYPE,
};

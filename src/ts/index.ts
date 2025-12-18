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
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
} from './platform/environment';
import type { WorkerTypeSupport } from './types/internal';
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

import type { PoolOptions, ExecOptions, PoolStats, WorkerProxy } from './types/index';
import type { Capabilities } from './platform/capabilities';
import type { BinarySerializedData } from './core/binary-serializer';
import type { WorkerConfig, WorkerConfigOptions } from './platform/worker-url';

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

// Export Bun compatibility utilities
export { isBun, bunVersion, recommendedWorkerType, getWorkerTypeSupport, isWorkerTypeSupported };

// Export error types
export { TerminateError };

// Export Pool classes for direct instantiation
export { Pool, PoolEnhanced };

// Export shared pool utilities
export { getSharedPool, terminateSharedPool, hasSharedPool };

// Export capabilities API (Issue 8.1)
export { capabilities, getCapabilities, canUseOptimalTransfer, canUseZeroCopy, getCapabilityReport };

// Export worker URL utilities (Issue 4.2)
export { resolveWorkerUrl, createWorkerBlobUrl, revokeWorkerBlobUrl, getWorkerConfig, supportsWorkerModules };

// Export binary serialization (Issue 1.3)
export { serializeBinary, deserializeBinary, shouldUseBinarySerialization, estimateBinarySize };

// Re-export types
export type {
  PoolOptions,
  ExecOptions,
  PoolStats,
  WorkerProxy,
  WorkerType,
  WorkerRegisterOptions,
  Proxy,
  // New types
  Capabilities,
  EnhancedPoolOptions,
  EnhancedExecOptions,
  EnhancedPoolStats,
  PoolEvents,
  CircuitBreakerOptions,
  RetryOptions,
  MemoryOptions,
  HealthCheckOptions,
  BinarySerializedData,
  WorkerConfig,
  WorkerConfigOptions,
  // Bun compatibility types
  WorkerTypeSupport,
};

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
  // Bun compatibility
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
  getRuntimeInfo,
};

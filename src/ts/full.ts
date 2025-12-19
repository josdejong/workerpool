/**
 * Workerpool Full Build Entry Point
 *
 * The complete workerpool library (~15KB minified) including WASM support,
 * advanced error handling, debug utilities, and type-safe helpers.
 *
 * Use this when:
 * - You want WASM-accelerated lock-free queues
 * - You need advanced debugging and profiling
 * - You want comprehensive type safety
 * - Bundle size is not a primary concern
 *
 * @example
 * ```typescript
 * // ESM import
 * import workerpool from 'workerpool/full';
 *
 * // Or specific imports
 * import { pool, canUseWasm, WasmBridge } from 'workerpool/full';
 * ```
 *
 * @module workerpool/full
 */

// Import TypeScript modules
import { Pool } from './core/Pool';
import { add as workerAdd, emit as workerEmit } from './workers/worker';
import { WorkerpoolPromise } from './core/Promise';
import Transfer from './platform/transfer';
import {
  platform,
  isMainThread,
  cpus,
  isNode,
  getPlatformInfo,
  hasWorkerThreads,
  hasSharedArrayBuffer as hasSharedArrayBufferEnv,
  hasAtomics as hasAtomicsEnv,
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
} from './platform/environment';
import type { PlatformInfo, WorkerTypeSupport } from './types/internal';

// Import circular buffer utilities
import {
  CircularBuffer,
  GrowableCircularBuffer,
  TimeWindowBuffer,
} from './core/circular-buffer';
import type { TimestampedValue } from './core/circular-buffer';

// Import queue implementations
import { FIFOQueue, LIFOQueue } from './core/TaskQueue';

// ============================================================================
// Core APIs (same as minimal)
// ============================================================================

// Core pool function
export function pool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): Pool {
  return new Pool(script as string | undefined, options);
}

// Worker registration function
export function worker(methods?: Record<string, (...args: unknown[]) => unknown>, options?: object): void {
  workerAdd(methods, options);
}

// Worker emit function (renamed to avoid conflict with import)
export function workerEmitEvent(payload: unknown): void {
  workerEmit(payload);
}
// Also export as workerEmit for backwards compatibility
export { workerEmit };

// Promise implementation
export const Promise = WorkerpoolPromise;

// Transfer utility - re-export
export { Transfer };

// Platform detection - re-export
export { platform, isMainThread, cpus };

// ============================================================================
// Extended Platform Detection
// ============================================================================

// Platform detection utilities
export {
  isNode,
  getPlatformInfo,
  hasWorkerThreads,
};

// Re-export environment hasSharedArrayBuffer/hasAtomics with unique names
// (wasm module also exports these, so we alias them)
export { hasSharedArrayBufferEnv, hasAtomicsEnv };

// Bun compatibility utilities
export {
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
};

// Platform types
export type { PlatformInfo, WorkerTypeSupport };

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

// Circular buffer types
export type { TimestampedValue };

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
// Transfer Helpers
// ============================================================================

export {
  transferFloat64,
  transferFloat32,
  transferInt32,
  transferUint32,
  transferInt16,
  transferUint16,
  transferInt8,
  transferUint8,
  transferUint8Clamped,
  transferBigInt64,
  transferBigUint64,
  transferTypedArray,
  transferArrayBuffer,
  transferArrayBuffers,
  transferObject,
  transferImageData,
} from './platform/transfer';

export type {
  TypedArray,
  TypedArrayConstructor,
} from './platform/transfer';

// ============================================================================
// WASM Support
// ============================================================================

// Import feature detection functions for use in helper functions
import {
  canUseWasm as _canUseWasm,
  canUseWasmThreads as _canUseWasmThreads,
} from './wasm';

export {
  // Feature detection
  canUseWasm,
  canUseSharedMemory,
  canUseWasmThreads,
  getFeatureStatus,
  clearFeatureCache,
  detectWASMFeatures,
  getRecommendedQueueType,
  warnIfWASMUnavailable,
  hasWebAssembly,
  hasSharedArrayBuffer,
  hasAtomics,
  hasWASMThreads,
  isSecureContext,
  getFeatureReport,

  // WASM Bridge
  WasmBridge,
  isSharedMemorySupported,
  calculateMemoryPages,
  loadWasm,
  loadWasmFromBytes,
  loadWasmSync,

  // WASM Queue
  WASMTaskQueue,
  WasmTaskQueue,
  createWASMQueue,

  // Embedded WASM
  setEmbeddedWasm,
  hasEmbeddedWasm,
  getEmbeddedWasmBytes,
  loadEmbeddedWasm,
  loadEmbeddedWasmSync,
  WasmFeatures,

  // Worker Template
  initWasmWorker,
  initWasmWorkerSync,
  getWasmBridge,
  getWasmExports,
  getSharedBuffer,
  isWasmInitialized,
  isUsingSharedMemory,
  wasmMethod,
  wasmMethodWithInit,
  createWasmWorker,
} from './wasm';

export type {
  WASMFeatureStatus,
  TaskMetadata,
  QueueEntry,
  QueueStats as WasmQueueStats,
  WasmExports,
  WasmLoadResult,
  WasmLoadOptions,
  WASMTaskQueueOptions,
  WasmWorkerInitOptions,
  WasmWorkerConfig,
} from './wasm';

// ============================================================================
// Error Classes
// ============================================================================

export {
  WorkerpoolError,
  CancellationError,
  TimeoutError,
  TerminationError,
  QueueFullError,
  QueueEmptyError,
  WasmNotAvailableError,
  SharedMemoryNotAvailableError,
  WasmInitializationError,
  WasmNotInitializedError,
  WasmMemoryError,
  TypeMismatchError,
  ValidationError,
  WorkerCreationError,
  NoWorkersAvailableError,
  MethodNotFoundError,
  getErrorTypeName,
  wrapError,
  assertType,
  TypeGuards,
} from './errors';

// ============================================================================
// Debug/Logging Utilities
// ============================================================================

export {
  LogLevel,
  LogCategory,
  enableDebug,
  disableDebug,
  getDebugConfig,
  isDebugEnabled,
  isCategoryEnabled,
  poolLog,
  workerLog,
  taskLog,
  queueLog,
  wasmLog,
  transferLog,
  perfLog,
  perfStart,
  perfEnd,
  getPerfEntries,
  clearPerfEntries,
  getPerfSummary,
  traced,
  logDispatch,
  logQueueOp,
  logWorkerEvent,
  logPoolEvent,
} from './debug';

export type {
  DebugConfig,
  LogHandler,
  PerfEntry,
} from './debug';

// ============================================================================
// Type-Safe Worker Definitions
// ============================================================================

export {
  defineWorkerMethods,
  createTypedProxy,
  typedMethod,
  asyncMethod,
  syncMethod,
  isMethodName,
  validateWorkerMethods,
  createMethodValidator,
} from './types/worker-methods';

export type {
  AnyWorkerMethod,
  WorkerMethodMap,
  MethodReturnType,
  PromisifiedMethod,
  PromisifiedMethodMap,
  MethodNames,
  MethodParams,
  MethodResult,
} from './types/worker-methods';

// ============================================================================
// Core Types
// ============================================================================

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
  Resolver,
  TransferDescriptor,
  WorkerArg,
  WebWorkerOptions,
  WorkerRegisterOptions,
  // Batch types
  BatchOptions,
  BatchProgress,
  BatchResult,
  BatchTaskResult,
  BatchTask,
  MapOptions,
  MapProgress,
  BatchPromise,
  ExecOptionsWithAffinity,
  PoolOptionsExtended,
  PoolMetricsSnapshot,
} from './types/index';

// ============================================================================
// Enhanced Pool & Capabilities (WORKERPOOL_IMPROVEMENTS.md)
// ============================================================================

export {
  PoolEnhanced,
  getSharedPool,
  terminateSharedPool,
  hasSharedPool,
} from './core/Pool';

export type {
  EnhancedPoolOptions,
  EnhancedExecOptions,
  EnhancedPoolStats,
  PoolEvents,
  PoolEventListener,
  DataTransferStrategy,
  MemoryPressureAction,
  CircuitState,
  CircuitBreakerOptions,
  RetryOptions,
  MemoryOptions,
  HealthCheckOptions,
} from './core/Pool';

// Capabilities API (Issue 8.1)
export {
  capabilities,
  getCapabilities,
  getCachedCapabilities,
  clearCapabilitiesCache,
  canUseOptimalTransfer,
  canUseZeroCopy,
  getCapabilityReport,
} from './platform/capabilities';

export type { Capabilities } from './platform/capabilities';

// Worker URL Utilities (Issue 4.2)
export {
  resolveWorkerUrl,
  createWorkerBlobUrl,
  revokeWorkerBlobUrl,
  getCurrentModuleUrl,
  createWorkerDataUrl,
  supportsWorkerModules,
  getWorkerConfig,
} from './platform/worker-url';

export type {
  WorkerConfig,
  WorkerConfigOptions,
} from './platform/worker-url';

// Binary Serialization (Issue 1.3)
export {
  serializeBinary,
  deserializeBinary,
  shouldUseBinarySerialization,
  estimateBinarySize,
} from './core/binary-serializer';

export type { BinarySerializedData } from './core/binary-serializer';

// Metrics Collector
export { MetricsCollector } from './core/metrics';
export type {
  PoolMetrics,
  LatencyHistogram,
  WorkerUtilization,
  QueueMetrics,
  ErrorMetrics,
  MetricsCollectorOptions,
} from './core/metrics';

/**
 * Create an enhanced pool with all advanced features
 */
export function enhancedPool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): Pool {
  return new Pool(script as string | undefined, options);
}

/**
 * Create a pool with optimal settings for the current runtime
 *
 * Automatically selects the best worker type for the platform:
 * - Bun: Uses 'thread' (worker_threads) due to IPC issues with child_process
 * - Node.js: Uses 'auto' (will select thread or process based on availability)
 * - Browser: Uses 'web' (Web Workers)
 */
export function optimalPool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): Pool {
  const baseOptions = typeof script === 'object' ? script : (options || {});
  const scriptPath = typeof script === 'string' ? script : undefined;

  const optimalOptions = {
    ...baseOptions,
    workerType: recommendedWorkerType,
    maxWorkers: (baseOptions as { maxWorkers?: number }).maxWorkers ?? Math.max((cpus || 4) - 1, 1),
  };

  return new Pool(scriptPath, optimalOptions);
}

/**
 * Get runtime information for diagnostics
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
// Worker Management (Advanced Features)
// ============================================================================

// Adaptive Scaler - Dynamic worker pool scaling
export {
  AdaptiveScaler,
  ScaleAction,
} from './workers/adaptive-scaler';

export type {
  ScaleDecision,
  ScalingThresholds,
  AdaptiveScalerOptions,
} from './workers/adaptive-scaler';

// Health Monitor - Worker health tracking
export {
  HealthMonitor,
  HealthStatus,
} from './workers/health-monitor';

export type {
  WorkerHealthCheck,
  HealthMonitorOptions,
} from './workers/health-monitor';

// Idle Recycler - Worker recycling based on idle time
export {
  IdleRecycler,
  RecycleReason,
} from './workers/recycler';

export type {
  RecycleCandidate,
  IdleRecyclerOptions,
} from './workers/recycler';

// Worker Affinity - Task-to-worker affinity for cache locality
export {
  WorkerAffinity,
  AffinityStrategy,
} from './workers/affinity';

export type {
  AffinityHint,
  AffinityMapping,
  WorkerAffinityOptions,
  AffinityStats,
} from './workers/affinity';

// Worker Cache - Worker instance caching
export {
  WorkerCache,
} from './workers/WorkerCache';

export type {
  WorkerCacheOptions,
  CachedWorker,
  WorkerCacheStats,
} from './workers/WorkerCache';

// ============================================================================
// Platform Optimization (Advanced Features)
// ============================================================================

// Message Batcher - Batch small messages for throughput
export {
  MessageBatcher,
  AdaptiveBatcher,
} from './platform/message-batcher';

export type {
  BatcherConfig,
  BatchedMessage,
  MessageBatch,
  BatchSendCallback,
} from './platform/message-batcher';

// Channel Factory - Communication channel abstraction
export {
  ChannelType,
  canUseSharedMemory as canUseSharedMemoryChannel,
  createChannel,
  MessagePassingChannel,
} from './platform/channel-factory';

export type {
  IChannel,
  SendResult as ChannelSendResult,
  ChannelFactoryOptions,
} from './platform/channel-factory';

// Structured Clone Optimization
export {
  optimizeForTransfer,
  hasTransferableContent,
  createOptimizedTransfer,
  CloneStrategy,
} from './platform/structured-clone';

export type {
  CloneOptimization,
  CloneOptions,
} from './platform/structured-clone';

// Result Stream - Streaming large results
export {
  ResultStreamSender,
  ResultStreamReceiver,
  StreamState,
  SharedMemoryResultStream,
} from './platform/result-stream';

export type {
  StreamChunk,
  StreamConfig,
  StreamProgress,
  StreamCallbacks,
} from './platform/result-stream';

// Transfer Detection - Transferable object detection
export {
  isTransferable,
  detectTransferables,
  getTransferableType,
  validateTransferables,
  TransferableType,
} from './platform/transfer-detection';

// ============================================================================
// Core Optimization (Advanced Features)
// ============================================================================

// Batch Serializer - Efficient batch task serialization
export {
  serializeBatch,
  deserializeBatch,
  serializeTaskResult,
  deserializeTaskResults,
  generateBatchId,
  serializeFunction,
  estimateBatchSize,
  collectTransferables,
  createBatchAggregator,
} from './core/batch-serializer';

export type {
  SerializedTask,
  SerializedBatch,
  SerializedTaskResult,
  SerializedBatchResult,
  SerializerConfig,
} from './core/batch-serializer';

// SIMD Processor - SIMD-accelerated operations
export {
  getSIMDProcessor,
  canUseSIMD,
  simdMapF32,
  simdReduceF32,
  simdDotProduct,
  resetSIMDProcessor,
} from './wasm/simd-processor';

export type {
  SIMDProcessor,
  SIMDOperation,
  ReduceOperation,
} from './wasm/simd-processor';

// ============================================================================
// Metadata
// ============================================================================

export const VERSION = '__VERSION__';
export const BUILD_TYPE = 'full' as const;

/**
 * Check if WASM features are available
 * Convenience re-export for quick checks
 */
export function hasWasmSupport(): boolean {
  return _canUseWasm();
}

/**
 * Check if full lock-free WASM support is available
 * (WebAssembly + SharedArrayBuffer + Atomics)
 */
export function hasFullWasmSupport(): boolean {
  return _canUseWasmThreads();
}

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

// Import CommonJS modules
import Pool from './Pool';
import workerModule from './worker';
import PromiseModule from './Promise';
import TransferModule from './transfer';
import environment from './environment';

// ============================================================================
// Core APIs (same as minimal)
// ============================================================================

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
} from './types/index';

// ============================================================================
// Enhanced Pool & Capabilities (WORKERPOOL_IMPROVEMENTS.md)
// ============================================================================

export {
  PoolEnhanced,
  getSharedPool,
  terminateSharedPool,
  hasSharedPool,
} from './core/PoolEnhanced';

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
} from './core/PoolEnhanced';

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
export function enhancedPool(script?: string | Record<string, unknown>, options?: Record<string, unknown>): InstanceType<typeof import('./core/PoolEnhanced').PoolEnhanced> {
  const { PoolEnhanced } = require('./core/PoolEnhanced');
  return new PoolEnhanced(script as string | undefined, options);
}

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

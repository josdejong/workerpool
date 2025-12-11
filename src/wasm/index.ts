/**
 * WASM Module Public API
 *
 * Exports high-level utilities for WASM-accelerated task queue operations.
 */

export {
  WasmBridge,
  isSharedMemorySupported,
  calculateMemoryPages,
  loadWasm,
  loadWasmFromBytes,
  loadWasmSync,
} from './WasmBridge';

export type {
  TaskMetadata,
  QueueEntry,
  QueueStats,
} from './WasmBridge';

export type {
  WasmExports,
  WasmLoadResult,
  WasmLoadOptions,
} from './WasmLoader';

export {
  WASMTaskQueue,
  WasmTaskQueue,
  createWASMQueue,
} from './WasmTaskQueue';

export type { WASMTaskQueueOptions } from './WasmTaskQueue';

export {
  detectWASMFeatures,
  getRecommendedQueueType,
  warnIfWASMUnavailable,
  hasWebAssembly,
  hasSharedArrayBuffer,
  hasAtomics,
  hasWASMThreads,
  isSecureContext,
  getFeatureReport,
} from './feature-detection';

export type { WASMFeatureStatus } from './feature-detection';

// Embedded WASM utilities
export {
  setEmbeddedWasm,
  hasEmbeddedWasm,
  getEmbeddedWasmBytes,
  loadEmbeddedWasm,
  loadEmbeddedWasmSync,
  WasmFeatures,
} from './EmbeddedWasmLoader';

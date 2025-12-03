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

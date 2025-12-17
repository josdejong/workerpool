/**
 * WASM Worker Template
 *
 * Provides utilities and templates for creating workers that use WASM modules.
 * Handles WASM loading, initialization, and method registration.
 */

import { WasmBridge, isSharedMemorySupported, calculateMemoryPages } from './WasmBridge';
import type { WasmExports, WasmLoadOptions } from './WasmLoader';
import {
  canUseWasm,
  canUseSharedMemory,
  canUseWasmThreads,
  getFeatureStatus,
} from './feature-detection';

// ============================================================================
// WASM Worker State
// ============================================================================

/**
 * Global WASM instance state within a worker
 */
interface WasmWorkerState {
  bridge: WasmBridge | null;
  exports: WasmExports | null;
  initialized: boolean;
  initPromise: Promise<void> | null;
  sharedBuffer: SharedArrayBuffer | null;
}

const wasmState: WasmWorkerState = {
  bridge: null,
  exports: null,
  initialized: false,
  initPromise: null,
  sharedBuffer: null,
};

// ============================================================================
// WASM Worker Initialization
// ============================================================================

/**
 * Options for initializing WASM in a worker
 */
export interface WasmWorkerInitOptions {
  /** URL to the WASM file (if not using embedded) */
  wasmUrl?: string;
  /** Pre-loaded WASM bytes (for embedded WASM) */
  wasmBytes?: ArrayBuffer | Uint8Array;
  /** SharedArrayBuffer from main thread (for shared memory) */
  sharedBuffer?: SharedArrayBuffer;
  /** Queue capacity (default: 1024) */
  capacity?: number;
  /** Additional WASM load options */
  loadOptions?: WasmLoadOptions;
}

/**
 * Initialize WASM module in the worker
 *
 * Call this at worker startup to load and initialize the WASM module.
 * Safe to call multiple times - subsequent calls return the existing instance.
 *
 * @example
 * ```typescript
 * // In worker.ts
 * import { initWasmWorker, getWasmExports } from 'workerpool/wasm';
 *
 * // Initialize on worker startup
 * await initWasmWorker({ wasmUrl: './workerpool.wasm' });
 *
 * // Now use WASM exports
 * const exports = getWasmExports();
 * ```
 */
export async function initWasmWorker(options: WasmWorkerInitOptions = {}): Promise<void> {
  // Return if already initialized
  if (wasmState.initialized) {
    return;
  }

  // Return existing promise if initialization is in progress
  if (wasmState.initPromise) {
    return wasmState.initPromise;
  }

  wasmState.initPromise = (async () => {
    const { wasmUrl, wasmBytes, sharedBuffer, capacity = 1024, loadOptions } = options;

    // Check WASM support
    if (!canUseWasm()) {
      throw new Error('WebAssembly is not supported in this environment');
    }

    // Create or attach to bridge
    if (sharedBuffer) {
      // Attach to existing shared buffer from main thread
      wasmState.sharedBuffer = sharedBuffer;
      wasmState.bridge = await WasmBridge.attachToBuffer(sharedBuffer, wasmUrl);
    } else if (wasmBytes) {
      // Load from pre-loaded bytes
      wasmState.bridge = await WasmBridge.createFromBytes(wasmBytes, capacity);
    } else if (wasmUrl) {
      // Load from URL
      wasmState.bridge = await WasmBridge.create(capacity, wasmUrl);
    } else {
      // Default: try to load from standard location
      wasmState.bridge = await WasmBridge.create(capacity);
    }

    wasmState.exports = wasmState.bridge['exports'];
    wasmState.initialized = true;
  })();

  return wasmState.initPromise;
}

/**
 * Initialize WASM module synchronously (from bytes only)
 *
 * Use this when you have WASM bytes available and need synchronous initialization.
 *
 * @param bytes - WASM module bytes
 * @param capacity - Queue capacity (default: 1024)
 */
export function initWasmWorkerSync(bytes: ArrayBuffer | Uint8Array, capacity: number = 1024): void {
  if (wasmState.initialized) {
    return;
  }

  if (!canUseWasm()) {
    throw new Error('WebAssembly is not supported in this environment');
  }

  wasmState.bridge = WasmBridge.createSync(bytes, capacity);
  wasmState.exports = wasmState.bridge['exports'];
  wasmState.initialized = true;
}

// ============================================================================
// WASM Access Functions
// ============================================================================

/**
 * Get the WASM bridge instance
 *
 * @throws Error if WASM is not initialized
 */
export function getWasmBridge(): WasmBridge {
  if (!wasmState.bridge) {
    throw new Error('WASM not initialized. Call initWasmWorker() first.');
  }
  return wasmState.bridge;
}

/**
 * Get the raw WASM exports
 *
 * @throws Error if WASM is not initialized
 */
export function getWasmExports(): WasmExports {
  if (!wasmState.exports) {
    throw new Error('WASM not initialized. Call initWasmWorker() first.');
  }
  return wasmState.exports;
}

/**
 * Get the shared memory buffer (if using shared memory)
 */
export function getSharedBuffer(): SharedArrayBuffer | null {
  return wasmState.sharedBuffer || (wasmState.bridge?.buffer instanceof SharedArrayBuffer ? wasmState.bridge.buffer : null);
}

/**
 * Check if WASM is initialized
 */
export function isWasmInitialized(): boolean {
  return wasmState.initialized;
}

/**
 * Check if using shared memory
 */
export function isUsingSharedMemory(): boolean {
  return wasmState.bridge?.isShared ?? false;
}

// ============================================================================
// WASM Worker Method Helpers
// ============================================================================

/**
 * Create a worker method that requires WASM
 *
 * Wraps a function to ensure WASM is initialized before execution.
 * Useful for defining worker methods that use WASM.
 *
 * @example
 * ```typescript
 * const methods = {
 *   processData: wasmMethod(async (data: Float64Array) => {
 *     const exports = getWasmExports();
 *     // Use WASM exports...
 *     return result;
 *   }),
 * };
 *
 * workerpool.worker(methods);
 * ```
 */
export function wasmMethod<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    if (!wasmState.initialized) {
      throw new Error('WASM not initialized. Call initWasmWorker() first.');
    }
    return fn(...args);
  };
}

/**
 * Create a worker method with automatic WASM initialization
 *
 * The first call will initialize WASM, subsequent calls use the existing instance.
 *
 * @example
 * ```typescript
 * const methods = {
 *   compute: wasmMethodWithInit(
 *     { wasmUrl: './workerpool.wasm' },
 *     (x: number) => {
 *       const exports = getWasmExports();
 *       return exports.compute(x);
 *     }
 *   ),
 * };
 * ```
 */
export function wasmMethodWithInit<TArgs extends unknown[], TReturn>(
  initOptions: WasmWorkerInitOptions,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    await initWasmWorker(initOptions);
    return fn(...args);
  };
}

// ============================================================================
// WASM Worker Template
// ============================================================================

/**
 * Configuration for creating a WASM worker
 */
export interface WasmWorkerConfig<TMethods extends Record<string, (...args: any[]) => any>> {
  /** WASM initialization options */
  wasmOptions: WasmWorkerInitOptions;
  /** Worker methods that use WASM */
  methods: TMethods;
  /** Called after WASM is initialized (optional) */
  onInit?: (bridge: WasmBridge) => void | Promise<void>;
  /** Called before worker terminates (optional) */
  onTerminate?: () => void | Promise<void>;
}

/**
 * Create a complete WASM worker configuration
 *
 * Returns an object ready to be passed to workerpool.worker().
 *
 * @example
 * ```typescript
 * const worker = createWasmWorker({
 *   wasmOptions: { wasmUrl: './workerpool.wasm' },
 *   methods: {
 *     async compute(x: number): Promise<number> {
 *       const exports = getWasmExports();
 *       return exports.someFunction(x);
 *     },
 *     async processArray(data: Float64Array): Promise<Float64Array> {
 *       const bridge = getWasmBridge();
 *       // Process with WASM...
 *       return result;
 *     }
 *   },
 *   onInit: (bridge) => {
 *     console.log('WASM initialized with capacity:', bridge.capacity);
 *   }
 * });
 *
 * // Register with workerpool
 * workerpool.worker(worker.methods, worker.options);
 * ```
 */
export function createWasmWorker<TMethods extends Record<string, (...args: any[]) => any>>(
  config: WasmWorkerConfig<TMethods>
): {
  methods: { [K in keyof TMethods]: (...args: Parameters<TMethods[K]>) => Promise<ReturnType<TMethods[K]>> };
  options: { onTerminate?: () => void | Promise<void> };
} {
  const { wasmOptions, methods, onInit, onTerminate } = config;

  // Wrap all methods with WASM initialization
  const wrappedMethods: Record<string, (...args: any[]) => Promise<any>> = {};

  for (const [name, method] of Object.entries(methods)) {
    wrappedMethods[name] = async (...args: any[]) => {
      // Initialize WASM on first method call
      if (!wasmState.initialized) {
        await initWasmWorker(wasmOptions);
        if (onInit && wasmState.bridge) {
          await onInit(wasmState.bridge);
        }
      }
      return method(...args);
    };
  }

  return {
    methods: wrappedMethods as any,
    options: {
      onTerminate: onTerminate,
    },
  };
}

// ============================================================================
// Exports for Feature Detection in Workers
// ============================================================================

export {
  canUseWasm,
  canUseSharedMemory,
  canUseWasmThreads,
  getFeatureStatus,
  isSharedMemorySupported,
  calculateMemoryPages,
};

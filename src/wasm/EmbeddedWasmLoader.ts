/**
 * Embedded WASM Loader
 *
 * Provides utilities for loading the WASM module from embedded base64 data,
 * eliminating the need for external WASM file loading.
 */

import { WasmExports, WasmLoadOptions, WasmLoadResult } from './WasmLoader';

// Will be populated by the build process
let embeddedWasmBase64: string | null = null;
let embeddedWasmBytes: Uint8Array | null = null;

/**
 * Set embedded WASM data (called during build or initialization)
 */
export function setEmbeddedWasm(base64: string): void {
  embeddedWasmBase64 = base64;
  embeddedWasmBytes = null; // Clear cached bytes
}

/**
 * Check if embedded WASM is available
 */
export function hasEmbeddedWasm(): boolean {
  return embeddedWasmBase64 !== null && embeddedWasmBase64.length > 0;
}

/**
 * Decode base64 to Uint8Array
 */
function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    // Browser
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else if (typeof Buffer !== 'undefined') {
    // Node.js
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    throw new Error('No base64 decoder available');
  }
}

/**
 * Get embedded WASM bytes
 */
export function getEmbeddedWasmBytes(): Uint8Array {
  if (!embeddedWasmBase64) {
    throw new Error('Embedded WASM not available. Build with WASM embedding enabled.');
  }

  if (!embeddedWasmBytes) {
    embeddedWasmBytes = decodeBase64(embeddedWasmBase64);
  }

  return embeddedWasmBytes;
}

/**
 * Check if SharedArrayBuffer is available
 */
export function isSharedMemorySupported(): boolean {
  try {
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }
    new SharedArrayBuffer(1);
    if (typeof Atomics === 'undefined') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Load WASM from embedded data
 */
export async function loadEmbeddedWasm(
  options: WasmLoadOptions = {}
): Promise<WasmLoadResult> {
  const bytes = getEmbeddedWasmBytes();
  return loadWasmFromBytes(bytes, options);
}

/**
 * Synchronously load WASM from embedded data
 */
export function loadEmbeddedWasmSync(
  options: WasmLoadOptions = {}
): WasmLoadResult {
  const bytes = getEmbeddedWasmBytes();
  return loadWasmFromBytesSync(bytes, options);
}

/**
 * Load WASM module from bytes
 */
export async function loadWasmFromBytes(
  bytes: ArrayBuffer | Uint8Array,
  options: WasmLoadOptions = {}
): Promise<WasmLoadResult> {
  const {
    initialMemory = 16,
    maximumMemory = 256,
    shared = isSharedMemorySupported(),
  } = options;

  // Create memory with SharedArrayBuffer if supported
  const memory = new WebAssembly.Memory({
    initial: initialMemory,
    maximum: maximumMemory,
    shared,
  });

  // Prepare imports
  const imports: WebAssembly.Imports = {
    env: {
      memory,
      abort: (message: number, fileName: number, line: number, column: number) => {
        console.error(`WASM abort at ${fileName}:${line}:${column} - ${message}`);
        throw new Error('WASM module aborted');
      },
      ...options.imports?.env,
    },
    ...options.imports,
  };

  const wasmResult = await WebAssembly.instantiate(bytes as BufferSource, imports);
  const instance = (wasmResult as WebAssembly.WebAssemblyInstantiatedSource).instance;

  return {
    instance,
    exports: instance.exports as unknown as WasmExports,
    memory,
    buffer: memory.buffer as SharedArrayBuffer | ArrayBuffer,
  };
}

/**
 * Synchronously load WASM module from bytes
 */
export function loadWasmFromBytesSync(
  bytes: ArrayBuffer | Uint8Array,
  options: WasmLoadOptions = {}
): WasmLoadResult {
  const {
    initialMemory = 16,
    maximumMemory = 256,
    shared = isSharedMemorySupported(),
  } = options;

  const memory = new WebAssembly.Memory({
    initial: initialMemory,
    maximum: maximumMemory,
    shared,
  });

  const imports: WebAssembly.Imports = {
    env: {
      memory,
      abort: (message: number, fileName: number, line: number, column: number) => {
        console.error(`WASM abort at ${fileName}:${line}:${column} - ${message}`);
        throw new Error('WASM module aborted');
      },
      ...options.imports?.env,
    },
    ...options.imports,
  };

  const module = new WebAssembly.Module(bytes as BufferSource);
  const instance = new WebAssembly.Instance(module, imports);

  return {
    instance,
    exports: instance.exports as unknown as WasmExports,
    memory,
    buffer: memory.buffer as SharedArrayBuffer | ArrayBuffer,
  };
}

/**
 * Calculate required memory pages for a given capacity
 */
export function calculateMemoryPages(capacity: number): number {
  // Header (64 bytes) + ring buffer (capacity * 8 bytes) + slots (capacity * 64 bytes)
  const headerSize = 64;
  const ringBufferSize = capacity * 8;
  const slotsSize = capacity * 64;
  const totalBytes = headerSize + ringBufferSize + slotsSize;

  // Memory page is 64KB (65536 bytes)
  const pageSize = 65536;
  return Math.ceil(totalBytes / pageSize);
}

/**
 * WASM feature detection utilities
 */
export const WasmFeatures = {
  /** Check if WebAssembly is supported */
  hasWebAssembly(): boolean {
    return typeof WebAssembly !== 'undefined' &&
           typeof WebAssembly.Module === 'function' &&
           typeof WebAssembly.Instance === 'function';
  },

  /** Check if SharedArrayBuffer is supported */
  hasSharedArrayBuffer(): boolean {
    return typeof SharedArrayBuffer !== 'undefined';
  },

  /** Check if Atomics API is supported */
  hasAtomics(): boolean {
    return typeof Atomics !== 'undefined';
  },

  /** Check if all required features are available */
  hasAllFeatures(): boolean {
    return this.hasWebAssembly() &&
           this.hasSharedArrayBuffer() &&
           this.hasAtomics();
  },

  /** Get feature report */
  getReport(): {
    webAssembly: boolean;
    sharedArrayBuffer: boolean;
    atomics: boolean;
    sharedMemory: boolean;
  } {
    return {
      webAssembly: this.hasWebAssembly(),
      sharedArrayBuffer: this.hasSharedArrayBuffer(),
      atomics: this.hasAtomics(),
      sharedMemory: isSharedMemorySupported(),
    };
  },
};

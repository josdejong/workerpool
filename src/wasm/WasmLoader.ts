/**
 * WASM Module Loader
 *
 * Provides abstraction for loading and instantiating WebAssembly modules
 * with SharedArrayBuffer support for cross-thread memory sharing.
 */

/** WASM module exports interface */
export interface WasmExports {
  // Memory management
  memory: WebAssembly.Memory;
  initMemory(capacity: number): number;
  validateMemory(): number;
  getCapacity(): number;
  getMask(): number;
  getSlotsBase(): number;
  getHead(): bigint;
  getTail(): bigint;
  calculateMemorySize(capacity: number): number;

  // Ring buffer operations
  push(slotIndex: number, priority?: number): number;
  pop(): bigint;
  size(): number;
  isEmpty(): number;
  isFull(): number;
  clear(): void;
  contains(slotIndex: number): number;
  packEntry(slotIndex: number, priority: number): bigint;
  unpackSlotIndex(entry: bigint): number;
  unpackPriority(entry: bigint): number;

  // Task slot operations
  initTaskSlots(): void;
  allocateSlot(): number;
  freeSlot(slotIndex: number): void;
  setTaskId(slotIndex: number, taskId: number): void;
  getTaskId(slotIndex: number): number;
  setPriority(slotIndex: number, priority: number): void;
  getPriority(slotIndex: number): number;
  setTimestamp(slotIndex: number, timestamp: bigint): void;
  getTimestamp(slotIndex: number): bigint;
  setMethodId(slotIndex: number, methodId: number): void;
  getMethodId(slotIndex: number): number;
  addRef(slotIndex: number): number;
  release(slotIndex: number): number;
  getRefCount(slotIndex: number): number;
  getAllocatedCount(): number;
  isAllocated(slotIndex: number): number;
}

/** Options for loading WASM module */
export interface WasmLoadOptions {
  /** Initial memory size in pages (64KB each) */
  initialMemory?: number;
  /** Maximum memory size in pages */
  maximumMemory?: number;
  /** Use SharedArrayBuffer for cross-thread sharing */
  shared?: boolean;
  /** Custom imports for the WASM module */
  imports?: WebAssembly.Imports;
}

/** Result of loading WASM module */
export interface WasmLoadResult {
  /** The instantiated WASM module */
  instance: WebAssembly.Instance;
  /** The WASM module exports */
  exports: WasmExports;
  /** The shared memory buffer */
  memory: WebAssembly.Memory;
  /** The underlying SharedArrayBuffer or ArrayBuffer */
  buffer: SharedArrayBuffer | ArrayBuffer;
}

/**
 * Check if SharedArrayBuffer is available
 */
export function isSharedMemorySupported(): boolean {
  try {
    // Check if SharedArrayBuffer exists and can be used
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }

    // Check if we can create one (may be blocked by COOP/COEP headers)
    new SharedArrayBuffer(1);

    // Check if Atomics API is available
    if (typeof Atomics === 'undefined') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
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
 * Default WASM binary URL resolver
 */
function getDefaultWasmUrl(): string {
  // Return a relative path that works in both browser and Node.js
  // Users should provide explicit URL for production use
  return 'workerpool.wasm';
}

/**
 * Load WASM module from URL
 */
export async function loadWasm(
  wasmUrl?: string,
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

  const url = wasmUrl || getDefaultWasmUrl();

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

  // Load and instantiate WASM module
  let instance: WebAssembly.Instance;

  if (typeof WebAssembly.instantiateStreaming === 'function') {
    // Use streaming compilation if available (more efficient)
    try {
      const result = await WebAssembly.instantiateStreaming(fetch(url), imports);
      instance = result.instance;
    } catch {
      // Fallback to non-streaming if streaming fails
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();
      const result = await WebAssembly.instantiate(bytes, imports);
      instance = result.instance;
    }
  } else {
    // Non-streaming fallback
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, imports);
    instance = result.instance;
  }

  return {
    instance,
    exports: instance.exports as unknown as WasmExports,
    memory,
    buffer: memory.buffer as SharedArrayBuffer | ArrayBuffer,
  };
}

/**
 * Load WASM module from bytes (useful for bundled WASM)
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
  // When passing bytes, result is WebAssemblyInstantiatedSource with instance property
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
 * Note: Only works if WASM module is small enough for sync compilation
 */
export function loadWasmSync(
  bytes: ArrayBuffer | Uint8Array,
  options: WasmLoadOptions = {}
): WasmLoadResult {
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

  const module = new WebAssembly.Module(bytes as BufferSource);
  const instance = new WebAssembly.Instance(module, imports);

  return {
    instance,
    exports: instance.exports as unknown as WasmExports,
    memory,
    buffer: memory.buffer as SharedArrayBuffer | ArrayBuffer,
  };
}

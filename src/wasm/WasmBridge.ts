/**
 * WASM Bridge Utilities
 *
 * Provides high-level TypeScript API for interacting with the WASM module.
 * Handles memory management, task queue operations, and slot allocation.
 */

import {
  WasmExports,
  WasmLoadResult,
  loadWasm,
  loadWasmFromBytes,
  loadWasmSync,
  isSharedMemorySupported,
  calculateMemoryPages,
} from './WasmLoader';

/** Task metadata stored in a slot */
export interface TaskMetadata {
  slotIndex: number;
  taskId: number;
  priority: number;
  timestamp: bigint;
  methodId: number;
  refCount: number;
}

/** Ring buffer entry */
export interface QueueEntry {
  slotIndex: number;
  priority: number;
}

/** Queue statistics */
export interface QueueStats {
  size: number;
  capacity: number;
  allocatedSlots: number;
  isEmpty: boolean;
  isFull: boolean;
}

/**
 * High-level bridge to WASM task queue and slot allocator
 */
export class WasmBridge {
  private exports: WasmExports;
  private memory: WebAssembly.Memory;
  private _buffer: SharedArrayBuffer | ArrayBuffer;
  private _capacity: number;
  private _initialized: boolean = false;

  private constructor(result: WasmLoadResult, capacity: number) {
    this.exports = result.exports;
    this.memory = result.memory;
    this._buffer = result.buffer;
    this._capacity = capacity;
  }

  /**
   * Create a new WasmBridge instance by loading WASM from URL
   */
  static async create(
    capacity: number = 1024,
    wasmUrl?: string
  ): Promise<WasmBridge> {
    const pages = calculateMemoryPages(capacity);
    const result = await loadWasm(wasmUrl, {
      initialMemory: pages,
      maximumMemory: pages * 4, // Allow some growth
      shared: isSharedMemorySupported(),
    });

    const bridge = new WasmBridge(result, capacity);
    bridge.initialize(capacity);
    return bridge;
  }

  /**
   * Create a new WasmBridge instance from WASM bytes
   */
  static async createFromBytes(
    bytes: ArrayBuffer | Uint8Array,
    capacity: number = 1024
  ): Promise<WasmBridge> {
    const pages = calculateMemoryPages(capacity);
    const result = await loadWasmFromBytes(bytes, {
      initialMemory: pages,
      maximumMemory: pages * 4,
      shared: isSharedMemorySupported(),
    });

    const bridge = new WasmBridge(result, capacity);
    bridge.initialize(capacity);
    return bridge;
  }

  /**
   * Create a new WasmBridge instance synchronously from WASM bytes
   */
  static createSync(
    bytes: ArrayBuffer | Uint8Array,
    capacity: number = 1024
  ): WasmBridge {
    const pages = calculateMemoryPages(capacity);
    const result = loadWasmSync(bytes, {
      initialMemory: pages,
      maximumMemory: pages * 4,
      shared: isSharedMemorySupported(),
    });

    const bridge = new WasmBridge(result, capacity);
    bridge.initialize(capacity);
    return bridge;
  }

  /**
   * Attach to existing shared memory buffer (for workers)
   */
  static async attachToBuffer(
    buffer: SharedArrayBuffer,
    wasmUrl?: string
  ): Promise<WasmBridge> {
    // Create memory from existing buffer
    const memory = new WebAssembly.Memory({
      initial: Math.ceil(buffer.byteLength / 65536),
      maximum: Math.ceil(buffer.byteLength / 65536) * 4,
      shared: true,
    });

    // Note: We can't actually replace the buffer, so we need to use
    // the buffer directly for operations. The WASM module will use
    // its own memory, but we'll read/write the shared buffer.

    const result = await loadWasm(wasmUrl, {
      initialMemory: Math.ceil(buffer.byteLength / 65536),
      shared: true,
    });

    // Get capacity from header
    const view = new DataView(buffer);
    const capacity = view.getUint32(24, true); // HEADER_CAPACITY_OFFSET

    const bridge = new WasmBridge(result, capacity);
    bridge._buffer = buffer;
    bridge._initialized = true; // Already initialized by main thread
    return bridge;
  }

  /**
   * Initialize memory layout
   */
  private initialize(capacity: number): void {
    if (this._initialized) return;

    const result = this.exports.initMemory(capacity);
    if (!result) {
      throw new Error('Failed to initialize WASM memory - already initialized');
    }

    this.exports.initTaskSlots();
    this._initialized = true;
  }

  /**
   * Get the shared memory buffer
   */
  get buffer(): SharedArrayBuffer | ArrayBuffer {
    return this._buffer;
  }

  /**
   * Check if using shared memory
   */
  get isShared(): boolean {
    return this._buffer instanceof SharedArrayBuffer;
  }

  /**
   * Get queue capacity
   */
  get capacity(): number {
    return this._capacity;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      size: this.exports.size(),
      capacity: this.exports.getCapacity(),
      allocatedSlots: this.exports.getAllocatedCount(),
      isEmpty: this.exports.isEmpty() !== 0,
      isFull: this.exports.isFull() !== 0,
    };
  }

  // ============ Queue Operations ============

  /**
   * Push a task onto the queue
   * @returns slot index if successful, -1 if queue is full
   */
  push(priority: number = 0): number {
    // First allocate a slot
    const slotIndex = this.exports.allocateSlot();
    if (slotIndex === 0xffffffff) {
      return -1; // No free slots
    }

    // Set priority in the slot
    this.exports.setPriority(slotIndex, priority);

    // Set timestamp
    this.exports.setTimestamp(slotIndex, BigInt(Date.now()));

    // Push to ring buffer
    const success = this.exports.push(slotIndex, priority);
    if (!success) {
      // Queue full, free the slot
      this.exports.freeSlot(slotIndex);
      return -1;
    }

    return slotIndex;
  }

  /**
   * Pop a task from the queue
   * @returns slot index and priority, or null if queue is empty
   */
  pop(): QueueEntry | null {
    const entry = this.exports.pop();
    if (entry === 0n) {
      return null;
    }

    return {
      slotIndex: this.exports.unpackSlotIndex(entry),
      priority: this.exports.unpackPriority(entry),
    };
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.exports.isEmpty() !== 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.exports.isFull() !== 0;
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.exports.size();
  }

  /**
   * Clear all entries from the queue
   * WARNING: Not thread-safe with concurrent push/pop
   */
  clear(): void {
    this.exports.clear();
  }

  // ============ Slot Operations ============

  /**
   * Allocate a new task slot
   * @returns slot index, or -1 if no slots available
   */
  allocateSlot(): number {
    const slotIndex = this.exports.allocateSlot();
    return slotIndex === 0xffffffff ? -1 : slotIndex;
  }

  /**
   * Free a task slot
   */
  freeSlot(slotIndex: number): void {
    this.exports.freeSlot(slotIndex);
  }

  /**
   * Get task metadata from a slot
   */
  getTaskMetadata(slotIndex: number): TaskMetadata | null {
    if (!this.exports.isAllocated(slotIndex)) {
      return null;
    }

    return {
      slotIndex,
      taskId: this.exports.getTaskId(slotIndex),
      priority: this.exports.getPriority(slotIndex),
      timestamp: this.exports.getTimestamp(slotIndex),
      methodId: this.exports.getMethodId(slotIndex),
      refCount: this.exports.getRefCount(slotIndex),
    };
  }

  /**
   * Set task ID in a slot
   */
  setTaskId(slotIndex: number, taskId: number): void {
    this.exports.setTaskId(slotIndex, taskId);
  }

  /**
   * Set method ID in a slot
   */
  setMethodId(slotIndex: number, methodId: number): void {
    this.exports.setMethodId(slotIndex, methodId);
  }

  /**
   * Set priority in a slot
   */
  setPriority(slotIndex: number, priority: number): void {
    this.exports.setPriority(slotIndex, priority);
  }

  /**
   * Increment reference count
   */
  addRef(slotIndex: number): number {
    return this.exports.addRef(slotIndex);
  }

  /**
   * Decrement reference count (frees slot if count reaches 0)
   */
  release(slotIndex: number): number {
    return this.exports.release(slotIndex);
  }

  /**
   * Check if a slot is allocated
   */
  isAllocated(slotIndex: number): boolean {
    return this.exports.isAllocated(slotIndex) !== 0;
  }

  /**
   * Get number of allocated slots
   */
  getAllocatedCount(): number {
    return this.exports.getAllocatedCount();
  }
}

/**
 * Export utilities for external use
 */
export {
  isSharedMemorySupported,
  calculateMemoryPages,
  loadWasm,
  loadWasmFromBytes,
  loadWasmSync,
};

export type { WasmExports, WasmLoadResult };

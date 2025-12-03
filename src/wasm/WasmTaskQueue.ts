/**
 * WASM-backed Task Queue
 *
 * Implements TaskQueue interface using WASM ring buffer and slot allocator.
 * Provides O(1) push/pop operations with lock-free concurrency support.
 */

import type { Task, TaskQueue } from '../types';
import {
  WasmBridge,
  isSharedMemorySupported,
  loadWasmFromBytes,
  loadWasmSync,
} from './WasmBridge';

/** Options for WASMTaskQueue */
export interface WASMTaskQueueOptions {
  /** Queue capacity (will be rounded to power of 2) */
  capacity?: number;
  /** Pre-loaded WASM bytes (optional, will fetch if not provided) */
  wasmBytes?: ArrayBuffer | Uint8Array;
  /** URL to WASM module (optional) */
  wasmUrl?: string;
}

/**
 * Task entry stored alongside WASM slot
 */
interface TaskEntry<T> {
  task: Task<T>;
  slotIndex: number;
}

/**
 * WASM-backed task queue with O(1) operations
 *
 * @template T - Task metadata type
 */
export class WASMTaskQueue<T = unknown> implements TaskQueue<T> {
  private bridge: WasmBridge;
  private taskMap: Map<number, Task<T>> = new Map();
  private _size = 0;
  private readonly _capacity: number;

  private constructor(bridge: WasmBridge, capacity: number) {
    this.bridge = bridge;
    this._capacity = capacity;
  }

  /**
   * Create a new WASMTaskQueue asynchronously
   */
  static async create<T = unknown>(
    options: WASMTaskQueueOptions = {}
  ): Promise<WASMTaskQueue<T>> {
    const capacity = options.capacity || 1024;

    let bridge: WasmBridge;
    if (options.wasmBytes) {
      bridge = await WasmBridge.createFromBytes(options.wasmBytes, capacity);
    } else {
      bridge = await WasmBridge.create(capacity, options.wasmUrl);
    }

    return new WASMTaskQueue<T>(bridge, capacity);
  }

  /**
   * Create a new WASMTaskQueue synchronously from WASM bytes
   */
  static createSync<T = unknown>(
    wasmBytes: ArrayBuffer | Uint8Array,
    capacity: number = 1024
  ): WASMTaskQueue<T> {
    const bridge = WasmBridge.createSync(wasmBytes, capacity);
    return new WASMTaskQueue<T>(bridge, capacity);
  }

  /**
   * Check if WASM task queue is supported in the current environment
   */
  static isSupported(): boolean {
    return isSharedMemorySupported();
  }

  /**
   * Get the capacity of the queue
   */
  get capacity(): number {
    return this._capacity;
  }

  /**
   * Get the shared memory buffer for cross-thread sharing
   */
  get buffer(): SharedArrayBuffer | ArrayBuffer {
    return this.bridge.buffer;
  }

  /**
   * Check if using shared memory
   */
  get isShared(): boolean {
    return this.bridge.isShared;
  }

  /**
   * Add a task to the queue
   * O(1) time complexity
   */
  push(task: Task<T>): void {
    // Extract priority from task metadata if available
    const priority = this.extractPriority(task);

    // Push to WASM ring buffer (allocates slot internally)
    const slotIndex = this.bridge.push(priority);

    if (slotIndex < 0) {
      throw new Error('Queue is full - cannot push task');
    }

    // Store task in JavaScript Map (keyed by slot index)
    this.taskMap.set(slotIndex, task);
    this._size++;

    // Store task metadata in WASM slot
    if (typeof task.method === 'string') {
      // Method ID is a hash of the method name
      this.bridge.setMethodId(slotIndex, this.hashString(task.method));
    }
  }

  /**
   * Remove and return the next task from the queue
   * O(1) time complexity
   */
  pop(): Task<T> | undefined {
    const entry = this.bridge.pop();

    if (!entry) {
      return undefined;
    }

    const { slotIndex } = entry;
    const task = this.taskMap.get(slotIndex);

    if (task) {
      this.taskMap.delete(slotIndex);
      this._size--;

      // Release the slot (decrements ref count, frees if zero)
      this.bridge.release(slotIndex);
    }

    return task;
  }

  /**
   * Get the current number of tasks in the queue
   */
  size(): number {
    return this._size;
  }

  /**
   * Check if a specific task is in the queue
   * O(n) time complexity - iterates through task map
   */
  contains(task: Task<T>): boolean {
    for (const [, storedTask] of this.taskMap) {
      if (storedTask === task) {
        return true;
      }
    }
    return false;
  }

  /**
   * Remove all tasks from the queue
   */
  clear(): void {
    // Free all allocated slots
    for (const slotIndex of this.taskMap.keys()) {
      this.bridge.freeSlot(slotIndex);
    }

    // Clear the ring buffer
    this.bridge.clear();

    // Clear the task map
    this.taskMap.clear();
    this._size = 0;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    size: number;
    capacity: number;
    allocatedSlots: number;
    wasmBufferSize: number;
    isEmpty: boolean;
    isFull: boolean;
  } {
    const bridgeStats = this.bridge.getStats();
    return {
      size: this._size,
      capacity: this._capacity,
      allocatedSlots: bridgeStats.allocatedSlots,
      wasmBufferSize: bridgeStats.size,
      isEmpty: this._size === 0,
      isFull: this._size >= this._capacity,
    };
  }

  /**
   * Extract priority from task metadata
   */
  private extractPriority(task: Task<T>): number {
    const metadata = task.options?.metadata;

    // Check if metadata has a priority field
    if (metadata && typeof metadata === 'object' && 'priority' in metadata) {
      const priority = (metadata as { priority: unknown }).priority;
      if (typeof priority === 'number') {
        return priority;
      }
    }

    // Default priority
    return 0;
  }

  /**
   * Simple string hash for method names
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Factory function to create task queue with WASM fallback
 */
export async function createWASMQueue<T = unknown>(
  options: WASMTaskQueueOptions = {}
): Promise<TaskQueue<T>> {
  if (!WASMTaskQueue.isSupported()) {
    throw new Error(
      'WASM TaskQueue requires SharedArrayBuffer and Atomics support. ' +
      'Use a JavaScript queue implementation as fallback.'
    );
  }

  return WASMTaskQueue.create<T>(options);
}

/**
 * Export for use in queue factory
 */
export { WASMTaskQueue as WasmTaskQueue };

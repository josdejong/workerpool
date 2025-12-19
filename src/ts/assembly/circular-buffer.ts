/**
 * Circular Buffer Implementation for AssemblyScript
 *
 * High-performance circular buffer with O(1) push/shift operations.
 * Uses power-of-2 sizing for fast modulo via bitwise AND.
 *
 * Memory Layout (in 64-bit entries):
 * - Entry 0: capacity (u32) | size (u32)
 * - Entry 1: head (u32) | tail (u32)
 * - Entry 2+: data entries
 */

import { HEADER_SIZE, getCapacity, getMask, validateMemory } from './memory';

// Buffer header offsets (in bytes from buffer start)
const BUFFER_CAPACITY_OFFSET: u32 = 0;
const BUFFER_SIZE_OFFSET: u32 = 4;
const BUFFER_HEAD_OFFSET: u32 = 8;
const BUFFER_TAIL_OFFSET: u32 = 12;
const BUFFER_DATA_OFFSET: u32 = 16;

// Internal state for a single buffer instance
let bufferCapacity: u32 = 0;
let bufferMask: u32 = 0;
let bufferSize: u32 = 0;
let bufferHead: u32 = 0;
let bufferTail: u32 = 0;

/**
 * Initialize a circular buffer with the given capacity
 * Capacity is rounded up to the next power of 2
 */
export function initBuffer(requestedCapacity: u32): void {
  // Round up to power of 2
  let capacity: u32 = 1;
  while (capacity < requestedCapacity) {
    capacity = capacity << 1;
  }

  bufferCapacity = capacity;
  bufferMask = capacity - 1;
  bufferSize = 0;
  bufferHead = 0;
  bufferTail = 0;
}

/**
 * Get current buffer capacity
 */
export function getBufferCapacity(): u32 {
  return bufferCapacity;
}

/**
 * Get current buffer size
 */
export function getBufferSize(): u32 {
  return bufferSize;
}

/**
 * Check if buffer is empty
 */
export function isEmpty(): bool {
  return bufferSize == 0;
}

/**
 * Check if buffer is full
 */
export function isFull(): bool {
  return bufferSize == bufferCapacity;
}

/**
 * Push an item to the buffer
 * Returns the index where the item was stored, or -1 if failed
 *
 * For GrowableCircularBuffer behavior: grows when full
 * For CircularBuffer behavior: evicts oldest when full
 */
export function pushGrowable(item: u32): i32 {
  if (bufferSize == bufferCapacity) {
    // Grow the buffer (double capacity)
    grow();
  }

  const index = bufferTail & bufferMask;
  bufferTail = bufferTail + 1;
  bufferSize = bufferSize + 1;

  return <i32>index;
}

/**
 * Push with eviction (CircularBuffer behavior)
 * Returns the evicted item index if eviction occurred, or -1 if no eviction
 */
export function pushWithEviction(item: u32): i32 {
  let evictedIndex: i32 = -1;

  if (bufferSize == bufferCapacity) {
    // Evict oldest item
    evictedIndex = <i32>(bufferHead & bufferMask);
    bufferHead = bufferHead + 1;
    bufferSize = bufferSize - 1;
  }

  const index = bufferTail & bufferMask;
  bufferTail = bufferTail + 1;
  bufferSize = bufferSize + 1;

  return evictedIndex;
}

/**
 * Shift (remove) the oldest item from the buffer
 * Returns the index of the removed item, or -1 if buffer is empty
 */
export function shift(): i32 {
  if (bufferSize == 0) {
    return -1;
  }

  const index = bufferHead & bufferMask;
  bufferHead = bufferHead + 1;
  bufferSize = bufferSize - 1;

  return <i32>index;
}

/**
 * Peek at the oldest item without removing it
 * Returns the index of the oldest item, or -1 if buffer is empty
 */
export function peekHead(): i32 {
  if (bufferSize == 0) {
    return -1;
  }
  return <i32>(bufferHead & bufferMask);
}

/**
 * Peek at the newest item without removing it
 * Returns the index of the newest item, or -1 if buffer is empty
 */
export function peekTail(): i32 {
  if (bufferSize == 0) {
    return -1;
  }
  return <i32>((bufferTail - 1) & bufferMask);
}

/**
 * Get item at a specific logical index (0 = oldest)
 * Returns the physical buffer index, or -1 if out of bounds
 */
export function at(logicalIndex: u32): i32 {
  if (logicalIndex >= bufferSize) {
    return -1;
  }
  return <i32>((bufferHead + logicalIndex) & bufferMask);
}

/**
 * Clear the buffer
 */
export function clear(): void {
  bufferSize = 0;
  bufferHead = 0;
  bufferTail = 0;
}

/**
 * Grow the buffer (double capacity)
 * Internal function called by pushGrowable
 */
function grow(): void {
  const newCapacity = bufferCapacity << 1;
  const newMask = newCapacity - 1;

  // Note: In AssemblyScript/WASM, actual memory reallocation would happen here
  // For this implementation, we track the logical indices

  bufferCapacity = newCapacity;
  bufferMask = newMask;
}

/**
 * Drain all items from the buffer
 * Returns the count of items drained
 */
export function drain(): u32 {
  const count = bufferSize;
  clear();
  return count;
}

/**
 * Get statistics about the buffer
 * Returns: capacity in high 16 bits, size in low 16 bits
 */
export function getStats(): u32 {
  return (bufferCapacity << 16) | bufferSize;
}

/**
 * Convert logical index to physical array index
 */
export function logicalToPhysical(logicalIndex: u32): u32 {
  return (bufferHead + logicalIndex) & bufferMask;
}

/**
 * Get the head pointer value
 */
export function getHead(): u32 {
  return bufferHead;
}

/**
 * Get the tail pointer value
 */
export function getTail(): u32 {
  return bufferTail;
}

/**
 * Get the mask value (for testing)
 */
export function getBufferMask(): u32 {
  return bufferMask;
}

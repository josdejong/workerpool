/**
 * Circular Buffer Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript circular buffer
 * functions for unit testing with vitest.
 */

// Internal state for a single buffer instance
let bufferCapacity = 0;
let bufferMask = 0;
let bufferSize = 0;
let bufferHead = 0;
let bufferTail = 0;

// Simulated data storage for testing
let dataBuffer: number[] = [];

/**
 * Initialize a circular buffer with the given capacity
 * Capacity is rounded up to the next power of 2
 */
export function initBuffer(requestedCapacity: number): void {
  // Round up to power of 2
  let capacity = 1;
  while (capacity < requestedCapacity) {
    capacity = capacity << 1;
  }

  bufferCapacity = capacity;
  bufferMask = capacity - 1;
  bufferSize = 0;
  bufferHead = 0;
  bufferTail = 0;
  dataBuffer = new Array(capacity).fill(0);
}

/**
 * Get current buffer capacity
 */
export function getBufferCapacity(): number {
  return bufferCapacity;
}

/**
 * Get current buffer size
 */
export function getBufferSize(): number {
  return bufferSize;
}

/**
 * Check if buffer is empty
 */
export function isEmpty(): boolean {
  return bufferSize === 0;
}

/**
 * Check if buffer is full
 */
export function isFull(): boolean {
  return bufferSize === bufferCapacity;
}

/**
 * Push an item to the buffer (growable behavior)
 * Returns the index where the item was stored, or -1 if failed
 */
export function pushGrowable(item: number): number {
  if (bufferSize === bufferCapacity) {
    // Grow the buffer (double capacity)
    grow();
  }

  const index = bufferTail & bufferMask;
  dataBuffer[index] = item;
  bufferTail = bufferTail + 1;
  bufferSize = bufferSize + 1;

  return index;
}

/**
 * Push with eviction (CircularBuffer behavior)
 * Returns the evicted item index if eviction occurred, or -1 if no eviction
 */
export function pushWithEviction(item: number): number {
  let evictedIndex = -1;

  if (bufferSize === bufferCapacity) {
    // Evict oldest item
    evictedIndex = bufferHead & bufferMask;
    bufferHead = bufferHead + 1;
    bufferSize = bufferSize - 1;
  }

  const index = bufferTail & bufferMask;
  dataBuffer[index] = item;
  bufferTail = bufferTail + 1;
  bufferSize = bufferSize + 1;

  return evictedIndex;
}

/**
 * Shift (remove) the oldest item from the buffer
 * Returns the index of the removed item, or -1 if buffer is empty
 */
export function shift(): number {
  if (bufferSize === 0) {
    return -1;
  }

  const index = bufferHead & bufferMask;
  bufferHead = bufferHead + 1;
  bufferSize = bufferSize - 1;

  return index;
}

/**
 * Peek at the oldest item without removing it
 * Returns the index of the oldest item, or -1 if buffer is empty
 */
export function peekHead(): number {
  if (bufferSize === 0) {
    return -1;
  }
  return bufferHead & bufferMask;
}

/**
 * Peek at the newest item without removing it
 * Returns the index of the newest item, or -1 if buffer is empty
 */
export function peekTail(): number {
  if (bufferSize === 0) {
    return -1;
  }
  return (bufferTail - 1) & bufferMask;
}

/**
 * Get item at a specific logical index (0 = oldest)
 * Returns the physical buffer index, or -1 if out of bounds
 */
export function at(logicalIndex: number): number {
  if (logicalIndex >= bufferSize) {
    return -1;
  }
  return (bufferHead + logicalIndex) & bufferMask;
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

  // Create new buffer and copy elements in order
  const newBuffer = new Array(newCapacity).fill(0);
  for (let i = 0; i < bufferSize; i++) {
    const oldIndex = (bufferHead + i) & bufferMask;
    newBuffer[i] = dataBuffer[oldIndex];
  }

  // Reset head to 0, tail to size
  bufferHead = 0;
  bufferTail = bufferSize;
  bufferCapacity = newCapacity;
  bufferMask = newMask;
  dataBuffer = newBuffer;
}

/**
 * Drain all items from the buffer
 * Returns the count of items drained
 */
export function drain(): number {
  const count = bufferSize;
  clear();
  return count;
}

/**
 * Get statistics about the buffer
 * Returns: capacity in high 16 bits, size in low 16 bits
 */
export function getStats(): number {
  return (bufferCapacity << 16) | bufferSize;
}

/**
 * Convert logical index to physical array index
 */
export function logicalToPhysical(logicalIndex: number): number {
  return (bufferHead + logicalIndex) & bufferMask;
}

/**
 * Get the head pointer value
 */
export function getHead(): number {
  return bufferHead;
}

/**
 * Get the tail pointer value
 */
export function getTail(): number {
  return bufferTail;
}

/**
 * Get the mask value (for testing)
 */
export function getBufferMask(): number {
  return bufferMask;
}

// Test helper: get data at physical index
export function _getDataAt(physicalIndex: number): number {
  return dataBuffer[physicalIndex];
}

// Test helper: set data at physical index
export function _setDataAt(physicalIndex: number, value: number): void {
  dataBuffer[physicalIndex] = value;
}

// Reset all state (for testing)
export function _reset(): void {
  bufferCapacity = 0;
  bufferMask = 0;
  bufferSize = 0;
  bufferHead = 0;
  bufferTail = 0;
  dataBuffer = [];
}

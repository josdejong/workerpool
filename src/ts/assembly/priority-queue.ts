/**
 * Priority Queue Implementation in AssemblyScript
 *
 * Uses a binary heap for O(log n) push and pop operations.
 * Supports atomic operations for thread-safe priority updates.
 */

import {
  HEADER_SIZE,
  SLOT_SIZE,
  getCapacity,
  getSlotsBase,
  validateMemory,
} from './memory';

// Priority queue header offsets (stored after main header)
/** Offset for priority queue size */
const PQ_SIZE_OFFSET: u32 = 52;
/** Offset for priority queue heap start */
const PQ_HEAP_BASE_OFFSET: u32 = 56;

// Each heap entry is 8 bytes: 4 bytes priority + 4 bytes slot index
const HEAP_ENTRY_SIZE: u32 = 8;

/**
 * Get the base address of the priority queue heap
 */
function getHeapBase(): u32 {
  const slotsBase = getSlotsBase();
  const capacity = getCapacity();
  // Heap starts after task slots
  return slotsBase + (capacity * SLOT_SIZE);
}

/**
 * Get heap entry address
 */
function getHeapEntryAddr(index: u32): u32 {
  return getHeapBase() + (index * HEAP_ENTRY_SIZE);
}

/**
 * Pack priority and slot index into heap entry
 */
function packHeapEntry(priority: u32, slotIndex: u32): u64 {
  // Higher priority = smaller value for min-heap behavior
  // We invert so that higher priority numbers have higher actual priority
  const invertedPriority = 0xFFFFFFFF - priority;
  return ((<u64>invertedPriority) << 32) | <u64>slotIndex;
}

/**
 * Unpack priority from heap entry
 */
function unpackPriority(entry: u64): u32 {
  const invertedPriority = <u32>(entry >> 32);
  return 0xFFFFFFFF - invertedPriority;
}

/**
 * Unpack slot index from heap entry
 */
function unpackSlotIndex(entry: u64): u32 {
  return <u32>(entry & 0xFFFFFFFF);
}

/**
 * Get parent index in heap
 */
function parentIndex(i: u32): u32 {
  return (i - 1) >> 1;
}

/**
 * Get left child index in heap
 */
function leftChildIndex(i: u32): u32 {
  return (i << 1) + 1;
}

/**
 * Get right child index in heap
 */
function rightChildIndex(i: u32): u32 {
  return (i << 1) + 2;
}

/**
 * Initialize priority queue
 */
export function initPriorityQueue(): void {
  if (!validateMemory()) return;
  atomic.store<u32>(PQ_SIZE_OFFSET, 0);
}

/**
 * Get current priority queue size
 */
export function getPriorityQueueSize(): u32 {
  return atomic.load<u32>(PQ_SIZE_OFFSET);
}

/**
 * Check if priority queue is empty
 */
export function isPriorityQueueEmpty(): bool {
  return getPriorityQueueSize() == 0;
}

/**
 * Sift up operation for heap insertion
 */
function siftUp(index: u32): void {
  while (index > 0) {
    const parent = parentIndex(index);
    const parentAddr = getHeapEntryAddr(parent);
    const currentAddr = getHeapEntryAddr(index);

    const parentEntry = atomic.load<u64>(parentAddr);
    const currentEntry = atomic.load<u64>(currentAddr);

    // If parent has lower priority (higher value after inversion), swap
    if (parentEntry > currentEntry) {
      atomic.store<u64>(parentAddr, currentEntry);
      atomic.store<u64>(currentAddr, parentEntry);
      index = parent;
    } else {
      break;
    }
  }
}

/**
 * Sift down operation for heap extraction
 */
function siftDown(index: u32, heapSize: u32): void {
  while (true) {
    const left = leftChildIndex(index);
    const right = rightChildIndex(index);
    let smallest = index;

    const currentAddr = getHeapEntryAddr(index);
    const currentEntry = atomic.load<u64>(currentAddr);

    if (left < heapSize) {
      const leftAddr = getHeapEntryAddr(left);
      const leftEntry = atomic.load<u64>(leftAddr);
      if (leftEntry < currentEntry) {
        smallest = left;
      }
    }

    if (right < heapSize) {
      const rightAddr = getHeapEntryAddr(right);
      const rightEntry = atomic.load<u64>(rightAddr);
      const smallestAddr = getHeapEntryAddr(smallest);
      const smallestEntry = atomic.load<u64>(smallestAddr);
      if (rightEntry < smallestEntry) {
        smallest = right;
      }
    }

    if (smallest != index) {
      const smallestAddr = getHeapEntryAddr(smallest);
      const smallestEntry = atomic.load<u64>(smallestAddr);
      atomic.store<u64>(smallestAddr, currentEntry);
      atomic.store<u64>(currentAddr, smallestEntry);
      index = smallest;
    } else {
      break;
    }
  }
}

/**
 * Push an entry onto the priority queue
 * Returns true if successful, false if queue is full
 */
export function priorityQueuePush(slotIndex: u32, priority: u32): bool {
  if (!validateMemory()) return false;

  const capacity = getCapacity();

  // Try to increment size atomically
  while (true) {
    const currentSize = atomic.load<u32>(PQ_SIZE_OFFSET);

    if (currentSize >= capacity) {
      return false; // Queue is full
    }

    const newSize = currentSize + 1;
    const swapped = atomic.cmpxchg<u32>(PQ_SIZE_OFFSET, currentSize, newSize);

    if (swapped == currentSize) {
      // Successfully claimed a slot
      const entry = packHeapEntry(priority, slotIndex);
      const entryAddr = getHeapEntryAddr(currentSize);
      atomic.store<u64>(entryAddr, entry);

      // Sift up to maintain heap property
      siftUp(currentSize);
      return true;
    }

    // Another thread beat us, retry
  }
}

/**
 * Pop the highest priority entry from the queue
 * Returns the slot index, or 0xFFFFFFFF if queue is empty
 */
export function priorityQueuePop(): u32 {
  if (!validateMemory()) return 0xFFFFFFFF;

  while (true) {
    const currentSize = atomic.load<u32>(PQ_SIZE_OFFSET);

    if (currentSize == 0) {
      return 0xFFFFFFFF; // Queue is empty
    }

    const newSize = currentSize - 1;
    const swapped = atomic.cmpxchg<u32>(PQ_SIZE_OFFSET, currentSize, newSize);

    if (swapped == currentSize) {
      // Successfully decremented size
      const rootAddr = getHeapEntryAddr(0);
      const rootEntry = atomic.load<u64>(rootAddr);
      const slotIndex = unpackSlotIndex(rootEntry);

      if (newSize > 0) {
        // Move last element to root and sift down
        const lastAddr = getHeapEntryAddr(newSize);
        const lastEntry = atomic.load<u64>(lastAddr);
        atomic.store<u64>(rootAddr, lastEntry);
        atomic.store<u64>(lastAddr, 0); // Clear last slot
        siftDown(0, newSize);
      } else {
        // Queue is now empty, clear root
        atomic.store<u64>(rootAddr, 0);
      }

      return slotIndex;
    }

    // Another thread beat us, retry
  }
}

/**
 * Peek at the highest priority entry without removing it
 * Returns the slot index, or 0xFFFFFFFF if queue is empty
 */
export function priorityQueuePeek(): u32 {
  if (!validateMemory()) return 0xFFFFFFFF;

  const size = getPriorityQueueSize();
  if (size == 0) {
    return 0xFFFFFFFF;
  }

  const rootAddr = getHeapEntryAddr(0);
  const rootEntry = atomic.load<u64>(rootAddr);
  return unpackSlotIndex(rootEntry);
}

/**
 * Get the priority of the highest priority entry
 * Returns 0 if queue is empty
 */
export function priorityQueuePeekPriority(): u32 {
  if (!validateMemory()) return 0;

  const size = getPriorityQueueSize();
  if (size == 0) {
    return 0;
  }

  const rootAddr = getHeapEntryAddr(0);
  const rootEntry = atomic.load<u64>(rootAddr);
  return unpackPriority(rootEntry);
}

/**
 * Clear the priority queue
 */
export function priorityQueueClear(): void {
  if (!validateMemory()) return;

  const size = atomic.load<u32>(PQ_SIZE_OFFSET);
  const heapBase = getHeapBase();

  // Clear all entries
  for (let i: u32 = 0; i < size; i++) {
    atomic.store<u64>(heapBase + (i * HEAP_ENTRY_SIZE), 0);
  }

  atomic.store<u32>(PQ_SIZE_OFFSET, 0);
}

/**
 * Check if the priority queue is full
 */
export function isPriorityQueueFull(): bool {
  if (!validateMemory()) return true;
  const capacity = getCapacity();
  return getPriorityQueueSize() >= capacity;
}

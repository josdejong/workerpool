/**
 * Lock-Free Ring Buffer Implementation
 *
 * Uses Atomics for thread-safe operations without locks.
 * Implements a SPMC (Single Producer, Multiple Consumer) queue
 * optimized for task scheduling.
 */

import {
  HEADER_SIZE,
  HEADER_HEAD_OFFSET,
  HEADER_TAIL_OFFSET,
  getCapacity,
  getMask,
  validateMemory,
} from './memory';

// Entry states
const ENTRY_EMPTY: u64 = 0;

/**
 * Pack task ID and priority into a single u64 entry
 * Upper 32 bits: priority (higher = more important)
 * Lower 32 bits: task slot index + 1 (to ensure entry is never 0)
 *
 * Note: We store slotIndex + 1 so that slot 0 with priority 0
 * produces entry value 1, not 0 (which would collide with ENTRY_EMPTY)
 */
export function packEntry(slotIndex: u32, priority: u32): u64 {
  return ((<u64>priority) << 32) | <u64>(slotIndex + 1);
}

/**
 * Unpack slot index from entry
 */
export function unpackSlotIndex(entry: u64): u32 {
  return <u32>((entry & 0xFFFFFFFF) - 1);
}

/**
 * Unpack priority from entry
 */
export function unpackPriority(entry: u64): u32 {
  return <u32>(entry >> 32);
}

/**
 * Get ring buffer entry address for a given index
 */
function getEntryAddress(index: u64): u32 {
  const mask = getMask();
  const wrappedIndex = <u32>(index & <u64>mask);
  return HEADER_SIZE + (wrappedIndex * 8);
}

/**
 * Push an entry onto the ring buffer
 * Returns true if successful, false if buffer is full
 */
export function push(slotIndex: u32, priority: u32 = 0): bool {
  if (!validateMemory()) return false;

  const capacity: u64 = <u64>getCapacity();
  const entry = packEntry(slotIndex, priority);

  // Try to advance tail atomically
  while (true) {
    const tail = atomic.load<u64>(HEADER_TAIL_OFFSET);
    const head = atomic.load<u64>(HEADER_HEAD_OFFSET);

    // Check if buffer is full
    if (tail - head >= capacity) {
      return false;
    }

    // Try to claim this slot
    const entryAddr = getEntryAddress(tail);
    const oldEntry = atomic.load<u64>(entryAddr);

    if (oldEntry != ENTRY_EMPTY) {
      // Slot not yet consumed, buffer is full
      return false;
    }

    // Try to write entry using compare-exchange
    const swapped = atomic.cmpxchg<u64>(entryAddr, ENTRY_EMPTY, entry);

    if (swapped == ENTRY_EMPTY) {
      // Successfully wrote entry, advance tail
      atomic.add<u64>(HEADER_TAIL_OFFSET, 1);
      return true;
    }

    // Another thread beat us, retry
  }
}

/**
 * Pop an entry from the ring buffer
 * Returns 0 if buffer is empty, otherwise returns the entry value
 */
export function pop(): u64 {
  if (!validateMemory()) return ENTRY_EMPTY;

  while (true) {
    const head = atomic.load<u64>(HEADER_HEAD_OFFSET);
    const tail = atomic.load<u64>(HEADER_TAIL_OFFSET);

    // Check if buffer is empty
    if (head >= tail) {
      return ENTRY_EMPTY;
    }

    const entryAddr = getEntryAddress(head);
    const entry = atomic.load<u64>(entryAddr);

    if (entry == ENTRY_EMPTY) {
      // Entry not yet written, wait
      return ENTRY_EMPTY;
    }

    // Try to advance head
    const swapped = atomic.cmpxchg<u64>(HEADER_HEAD_OFFSET, head, head + 1);

    if (swapped == head) {
      // Successfully claimed this entry, clear it and return
      atomic.store<u64>(entryAddr, ENTRY_EMPTY);
      return entry;
    }

    // Another thread beat us, retry
  }
}

/**
 * Get current number of entries in the buffer
 */
export function size(): u32 {
  if (!validateMemory()) return 0;

  const head = atomic.load<u64>(HEADER_HEAD_OFFSET);
  const tail = atomic.load<u64>(HEADER_TAIL_OFFSET);

  if (tail >= head) {
    return <u32>(tail - head);
  }
  return 0;
}

/**
 * Check if the buffer is empty
 */
export function isEmpty(): bool {
  return size() == 0;
}

/**
 * Check if the buffer is full
 */
export function isFull(): bool {
  if (!validateMemory()) return true;

  const capacity = getCapacity();
  return size() >= capacity;
}

/**
 * Clear all entries from the buffer
 * WARNING: This is not thread-safe with concurrent push/pop
 */
export function clear(): void {
  if (!validateMemory()) return;

  const capacity = getCapacity();

  // Reset head and tail
  atomic.store<u64>(HEADER_HEAD_OFFSET, 0);
  atomic.store<u64>(HEADER_TAIL_OFFSET, 0);

  // Clear all entries
  for (let i: u32 = 0; i < capacity; i++) {
    const entryAddr = HEADER_SIZE + (i * 8);
    atomic.store<u64>(entryAddr, ENTRY_EMPTY);
  }
}

/**
 * Check if a specific slot index is in the buffer
 * Note: This is O(n) and should be used sparingly
 */
export function contains(slotIndex: u32): bool {
  if (!validateMemory()) return false;

  const head = atomic.load<u64>(HEADER_HEAD_OFFSET);
  const tail = atomic.load<u64>(HEADER_TAIL_OFFSET);
  const mask = getMask();

  for (let i = head; i < tail; i++) {
    const wrappedIndex = <u32>(i & <u64>mask);
    const entryAddr = HEADER_SIZE + (wrappedIndex * 8);
    const entry = atomic.load<u64>(entryAddr);

    if (entry != ENTRY_EMPTY && unpackSlotIndex(entry) == slotIndex) {
      return true;
    }
  }

  return false;
}

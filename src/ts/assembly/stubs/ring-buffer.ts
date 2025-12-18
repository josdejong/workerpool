/**
 * Ring Buffer Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript ring buffer
 * functions for unit testing with vitest.
 */

import {
  HEADER_SIZE,
  getCapacity,
  getMask,
  validateMemory,
  getHead,
  getTail,
  _setHead,
  _setTail,
  _getEntries,
  _setEntry,
  _getEntry,
} from './memory';

// Entry states
const ENTRY_EMPTY = BigInt(0);

/**
 * Pack task ID and priority into a single bigint entry
 */
export function packEntry(slotIndex: number, priority: number): bigint {
  return (BigInt(priority) << BigInt(32)) | BigInt(slotIndex);
}

/**
 * Unpack slot index from entry
 */
export function unpackSlotIndex(entry: bigint): number {
  return Number(entry & BigInt(0xffffffff));
}

/**
 * Unpack priority from entry
 */
export function unpackPriority(entry: bigint): number {
  return Number(entry >> BigInt(32));
}

/**
 * Push an entry onto the ring buffer
 */
export function push(slotIndex: number, priority = 0): boolean {
  if (!validateMemory()) return false;

  const capacity = BigInt(getCapacity());
  const tail = getTail();
  const head = getHead();

  // Check if buffer is full
  if (tail - head >= capacity) {
    return false;
  }

  const mask = getMask();
  const wrappedIndex = Number(tail & BigInt(mask));

  // Check if slot is empty
  const currentEntry = _getEntry(wrappedIndex);
  if (currentEntry !== ENTRY_EMPTY) {
    return false;
  }

  // Write entry
  const entry = packEntry(slotIndex, priority);
  _setEntry(wrappedIndex, entry);
  _setTail(tail + BigInt(1));

  return true;
}

/**
 * Pop an entry from the ring buffer
 */
export function pop(): bigint {
  if (!validateMemory()) return ENTRY_EMPTY;

  const head = getHead();
  const tail = getTail();

  // Check if buffer is empty
  if (head >= tail) {
    return ENTRY_EMPTY;
  }

  const mask = getMask();
  const wrappedIndex = Number(head & BigInt(mask));
  const entry = _getEntry(wrappedIndex);

  if (entry === ENTRY_EMPTY) {
    return ENTRY_EMPTY;
  }

  // Clear entry and advance head
  _setEntry(wrappedIndex, ENTRY_EMPTY);
  _setHead(head + BigInt(1));

  return entry;
}

/**
 * Get current number of entries in the buffer
 */
export function size(): number {
  if (!validateMemory()) return 0;

  const head = getHead();
  const tail = getTail();

  if (tail >= head) {
    return Number(tail - head);
  }
  return 0;
}

/**
 * Check if the buffer is empty
 */
export function isEmpty(): boolean {
  return size() === 0;
}

/**
 * Check if the buffer is full
 */
export function isFull(): boolean {
  if (!validateMemory()) return true;

  const capacity = getCapacity();
  return size() >= capacity;
}

/**
 * Clear all entries from the buffer
 */
export function clear(): void {
  if (!validateMemory()) return;

  const capacity = getCapacity();

  // Reset head and tail
  _setHead(BigInt(0));
  _setTail(BigInt(0));

  // Clear all entries
  for (let i = 0; i < capacity; i++) {
    _setEntry(i, ENTRY_EMPTY);
  }
}

/**
 * Check if a specific slot index is in the buffer
 */
export function contains(slotIndex: number): boolean {
  if (!validateMemory()) return false;

  const head = getHead();
  const tail = getTail();
  const mask = getMask();

  for (let i = head; i < tail; i++) {
    const wrappedIndex = Number(i & BigInt(mask));
    const entry = _getEntry(wrappedIndex);

    if (entry !== ENTRY_EMPTY && unpackSlotIndex(entry) === slotIndex) {
      return true;
    }
  }

  return false;
}

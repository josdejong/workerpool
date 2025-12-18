/**
 * Memory Management Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript memory
 * management functions for unit testing with vitest.
 *
 * Note: This is a testing stub - the actual WASM implementation uses
 * SharedArrayBuffer and atomics for thread-safety.
 */

// Memory layout constants (same as AssemblyScript)
export const HEADER_SIZE = 64;
export const SLOT_SIZE = 64;
export const DEFAULT_CAPACITY = 1024;
export const CACHE_LINE_SIZE = 64;

// Header offsets
export const HEADER_MAGIC_OFFSET = 0;
export const HEADER_VERSION_OFFSET = 4;
export const HEADER_HEAD_OFFSET = 8;
export const HEADER_TAIL_OFFSET = 16;
export const HEADER_CAPACITY_OFFSET = 24;
export const HEADER_MASK_OFFSET = 28;
export const HEADER_ALLOCATED_OFFSET = 32;
export const HEADER_SLOTS_BASE_OFFSET = 40;

// Magic number and version
export const MAGIC_NUMBER = 0x57504f4c; // "WPOL" in ASCII
export const VERSION = 1;

// Internal memory state for stubs
let _memory: {
  magic: number;
  version: number;
  head: bigint;
  tail: bigint;
  capacity: number;
  mask: number;
  allocated: number;
  slotsBase: number;
  entries: bigint[];
} | null = null;

/**
 * Check if a number is a power of 2
 */
export function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Round up to next power of 2
 */
export function nextPowerOf2(n: number): number {
  if (n === 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

/**
 * Calculate total memory size needed for a ring buffer
 */
export function calculateMemorySize(capacity: number): number {
  const actualCapacity = isPowerOf2(capacity) ? capacity : nextPowerOf2(capacity);
  return HEADER_SIZE + actualCapacity * 8 + actualCapacity * SLOT_SIZE;
}

/**
 * Initialize memory layout for ring buffer
 */
export function initMemory(capacity: number): boolean {
  if (_memory?.magic === MAGIC_NUMBER) {
    return false; // Already initialized
  }

  const actualCapacity = isPowerOf2(capacity) ? capacity : nextPowerOf2(capacity);
  const mask = actualCapacity - 1;
  const slotsBase = HEADER_SIZE + actualCapacity * 8;

  _memory = {
    magic: MAGIC_NUMBER,
    version: VERSION,
    head: BigInt(0),
    tail: BigInt(0),
    capacity: actualCapacity,
    mask,
    allocated: 0,
    slotsBase,
    entries: new Array(actualCapacity).fill(BigInt(0)),
  };

  return true;
}

/**
 * Validate memory is properly initialized
 */
export function validateMemory(): boolean {
  return _memory?.magic === MAGIC_NUMBER && _memory?.version === VERSION;
}

/**
 * Get ring buffer capacity
 */
export function getCapacity(): number {
  return _memory?.capacity ?? 0;
}

/**
 * Get ring buffer mask (capacity - 1)
 */
export function getMask(): number {
  return _memory?.mask ?? 0;
}

/**
 * Get slot base address
 */
export function getSlotsBase(): number {
  return _memory?.slotsBase ?? 0;
}

/**
 * Get head pointer
 */
export function getHead(): bigint {
  return _memory?.head ?? BigInt(0);
}

/**
 * Get tail pointer
 */
export function getTail(): bigint {
  return _memory?.tail ?? BigInt(0);
}

/**
 * Calculate slot address for a given slot index
 */
export function getSlotAddress(slotIndex: number): number {
  const slotsBase = getSlotsBase();
  return slotsBase + slotIndex * SLOT_SIZE;
}

// Internal methods for stubs
export function _setHead(value: bigint): void {
  if (_memory) _memory.head = value;
}

export function _setTail(value: bigint): void {
  if (_memory) _memory.tail = value;
}

export function _setAllocated(value: number): void {
  if (_memory) _memory.allocated = value;
}

export function _getAllocated(): number {
  return _memory?.allocated ?? 0;
}

export function _getEntries(): bigint[] {
  return _memory?.entries ?? [];
}

export function _setEntry(index: number, value: bigint): void {
  if (_memory) _memory.entries[index] = value;
}

export function _getEntry(index: number): bigint {
  return _memory?.entries[index] ?? BigInt(0);
}

/**
 * Reset memory for testing
 */
export function _resetMemory(): void {
  _memory = null;
}

/**
 * WASM Memory Management Utilities
 *
 * Provides memory arena allocation and management for lock-free data structures.
 * Uses SharedArrayBuffer for cross-thread memory sharing.
 */

// Memory layout constants
// All sizes in bytes, aligned to 8-byte boundaries for atomic operations

/** Size of the memory header containing metadata */
export const HEADER_SIZE: u32 = 64;

/** Size of each task slot (fits task metadata) */
export const SLOT_SIZE: u32 = 64;

/** Default ring buffer capacity (must be power of 2) */
export const DEFAULT_CAPACITY: u32 = 1024;

/** Cache line size for alignment optimization */
export const CACHE_LINE_SIZE: u32 = 64;

// Header offsets
/** Offset for magic number to validate memory initialization */
export const HEADER_MAGIC_OFFSET: u32 = 0;
/** Offset for version number */
export const HEADER_VERSION_OFFSET: u32 = 4;
/** Offset for ring buffer head pointer */
export const HEADER_HEAD_OFFSET: u32 = 8;
/** Offset for ring buffer tail pointer */
export const HEADER_TAIL_OFFSET: u32 = 16;
/** Offset for ring buffer capacity */
export const HEADER_CAPACITY_OFFSET: u32 = 24;
/** Offset for ring buffer mask (capacity - 1) */
export const HEADER_MASK_OFFSET: u32 = 28;
/** Offset for allocated slot count */
export const HEADER_ALLOCATED_OFFSET: u32 = 32;
/** Offset for task slot base pointer */
export const HEADER_SLOTS_BASE_OFFSET: u32 = 40;

// Magic number to validate initialized memory
export const MAGIC_NUMBER: u32 = 0x57504F4C; // "WPOL" in ASCII

// Version for compatibility checking
export const VERSION: u32 = 1;

/**
 * Check if a number is a power of 2
 */
export function isPowerOf2(n: u32): bool {
  return n > 0 && (n & (n - 1)) == 0;
}

/**
 * Round up to next power of 2
 */
export function nextPowerOf2(n: u32): u32 {
  if (n == 0) return 1;
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
 * @param capacity - Number of slots (will be rounded to power of 2)
 */
export function calculateMemorySize(capacity: u32): u32 {
  const actualCapacity = isPowerOf2(capacity) ? capacity : nextPowerOf2(capacity);
  // Header + ring buffer entries (u64 each) + task slots
  return HEADER_SIZE + (actualCapacity * 8) + (actualCapacity * SLOT_SIZE);
}

/**
 * Initialize memory layout for ring buffer
 * @param capacity - Desired capacity (will be rounded to power of 2)
 * @returns true if initialization successful, false if already initialized
 */
export function initMemory(capacity: u32): bool {
  // Check if already initialized
  const existingMagic = atomic.load<u32>(HEADER_MAGIC_OFFSET);
  if (existingMagic == MAGIC_NUMBER) {
    return false; // Already initialized
  }

  const actualCapacity = isPowerOf2(capacity) ? capacity : nextPowerOf2(capacity);
  const mask = actualCapacity - 1;

  // Initialize header
  atomic.store<u32>(HEADER_MAGIC_OFFSET, MAGIC_NUMBER);
  atomic.store<u32>(HEADER_VERSION_OFFSET, VERSION);
  atomic.store<u64>(HEADER_HEAD_OFFSET, 0);
  atomic.store<u64>(HEADER_TAIL_OFFSET, 0);
  atomic.store<u32>(HEADER_CAPACITY_OFFSET, actualCapacity);
  atomic.store<u32>(HEADER_MASK_OFFSET, mask);
  atomic.store<u32>(HEADER_ALLOCATED_OFFSET, 0);

  // Calculate slot base (after header + ring buffer entries)
  const slotsBase = HEADER_SIZE + (actualCapacity * 8);
  atomic.store<u32>(HEADER_SLOTS_BASE_OFFSET, slotsBase);

  // Clear ring buffer entries
  const ringBase = HEADER_SIZE;
  for (let i: u32 = 0; i < actualCapacity; i++) {
    atomic.store<u64>(ringBase + i * 8, 0);
  }

  return true;
}

/**
 * Validate memory is properly initialized
 */
export function validateMemory(): bool {
  const magic = atomic.load<u32>(HEADER_MAGIC_OFFSET);
  const version = atomic.load<u32>(HEADER_VERSION_OFFSET);
  return magic == MAGIC_NUMBER && version == VERSION;
}

/**
 * Get ring buffer capacity
 */
export function getCapacity(): u32 {
  return atomic.load<u32>(HEADER_CAPACITY_OFFSET);
}

/**
 * Get ring buffer mask (capacity - 1) for fast modulo
 */
export function getMask(): u32 {
  return atomic.load<u32>(HEADER_MASK_OFFSET);
}

/**
 * Get slot base address
 */
export function getSlotsBase(): u32 {
  return atomic.load<u32>(HEADER_SLOTS_BASE_OFFSET);
}

/**
 * Get head pointer
 */
export function getHead(): u64 {
  return atomic.load<u64>(HEADER_HEAD_OFFSET);
}

/**
 * Get tail pointer
 */
export function getTail(): u64 {
  return atomic.load<u64>(HEADER_TAIL_OFFSET);
}

/**
 * Calculate slot address for a given slot index
 */
export function getSlotAddress(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  return slotsBase + (slotIndex * SLOT_SIZE);
}

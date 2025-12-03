/**
 * Task Slot Allocator
 *
 * Manages memory slots for storing task metadata.
 * Uses a free list for O(1) allocation/deallocation.
 */

import {
  SLOT_SIZE,
  HEADER_ALLOCATED_OFFSET,
  getSlotsBase,
  getCapacity,
  validateMemory,
} from './memory';

// Slot offsets within each slot
/** Offset for slot state (0=free, 1=allocated) */
const SLOT_STATE_OFFSET: u32 = 0;
/** Offset for next free slot index (when free) or task ID (when allocated) */
const SLOT_NEXT_OR_ID_OFFSET: u32 = 4;
/** Offset for task priority */
const SLOT_PRIORITY_OFFSET: u32 = 8;
/** Offset for task creation timestamp */
const SLOT_TIMESTAMP_OFFSET: u32 = 16;
/** Offset for task method ID */
const SLOT_METHOD_OFFSET: u32 = 24;
/** Offset for reference count */
const SLOT_REFCOUNT_OFFSET: u32 = 28;

// Slot states
const SLOT_FREE: u32 = 0;
const SLOT_ALLOCATED: u32 = 1;

// Special value for end of free list
const FREE_LIST_END: u32 = 0xFFFFFFFF;

// Free list head pointer (stored after main header)
const FREE_LIST_HEAD_OFFSET: u32 = 48;

/**
 * Initialize task slots with free list
 */
export function initTaskSlots(): void {
  if (!validateMemory()) return;

  const capacity = getCapacity();
  const slotsBase = getSlotsBase();

  // Build free list
  for (let i: u32 = 0; i < capacity; i++) {
    const slotAddr = slotsBase + (i * SLOT_SIZE);

    // Mark as free
    atomic.store<u32>(slotAddr + SLOT_STATE_OFFSET, SLOT_FREE);

    // Link to next free slot
    const nextFree = (i < capacity - 1) ? (i + 1) : FREE_LIST_END;
    atomic.store<u32>(slotAddr + SLOT_NEXT_OR_ID_OFFSET, nextFree);

    // Clear other fields
    atomic.store<u32>(slotAddr + SLOT_PRIORITY_OFFSET, 0);
    atomic.store<u64>(slotAddr + SLOT_TIMESTAMP_OFFSET, 0);
    atomic.store<u32>(slotAddr + SLOT_METHOD_OFFSET, 0);
    atomic.store<u32>(slotAddr + SLOT_REFCOUNT_OFFSET, 0);
  }

  // Set free list head to first slot
  atomic.store<u32>(FREE_LIST_HEAD_OFFSET, 0);
  atomic.store<u32>(HEADER_ALLOCATED_OFFSET, 0);
}

/**
 * Allocate a task slot
 * Returns slot index or FREE_LIST_END if no slots available
 */
export function allocateSlot(): u32 {
  if (!validateMemory()) return FREE_LIST_END;

  const slotsBase = getSlotsBase();

  while (true) {
    const head = atomic.load<u32>(FREE_LIST_HEAD_OFFSET);

    if (head == FREE_LIST_END) {
      return FREE_LIST_END; // No free slots
    }

    const slotAddr = slotsBase + (head * SLOT_SIZE);
    const nextFree = atomic.load<u32>(slotAddr + SLOT_NEXT_OR_ID_OFFSET);

    // Try to advance free list head
    const swapped = atomic.cmpxchg<u32>(FREE_LIST_HEAD_OFFSET, head, nextFree);

    if (swapped == head) {
      // Successfully claimed slot
      atomic.store<u32>(slotAddr + SLOT_STATE_OFFSET, SLOT_ALLOCATED);
      atomic.store<u32>(slotAddr + SLOT_REFCOUNT_OFFSET, 1);
      atomic.add<u32>(HEADER_ALLOCATED_OFFSET, 1);
      return head;
    }

    // Another thread beat us, retry
  }
}

/**
 * Free a task slot
 */
export function freeSlot(slotIndex: u32): void {
  if (!validateMemory()) return;

  const capacity = getCapacity();
  if (slotIndex >= capacity) return;

  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);

  // Check if already free
  const state = atomic.load<u32>(slotAddr + SLOT_STATE_OFFSET);
  if (state == SLOT_FREE) return;

  while (true) {
    const head = atomic.load<u32>(FREE_LIST_HEAD_OFFSET);

    // Set next pointer to current head
    atomic.store<u32>(slotAddr + SLOT_NEXT_OR_ID_OFFSET, head);
    atomic.store<u32>(slotAddr + SLOT_STATE_OFFSET, SLOT_FREE);

    // Try to set new head
    const swapped = atomic.cmpxchg<u32>(FREE_LIST_HEAD_OFFSET, head, slotIndex);

    if (swapped == head) {
      atomic.sub<u32>(HEADER_ALLOCATED_OFFSET, 1);
      return;
    }

    // Retry if head changed
  }
}

/**
 * Set task ID in slot
 */
export function setTaskId(slotIndex: u32, taskId: u32): void {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  atomic.store<u32>(slotAddr + SLOT_NEXT_OR_ID_OFFSET, taskId);
}

/**
 * Get task ID from slot
 */
export function getTaskId(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.load<u32>(slotAddr + SLOT_NEXT_OR_ID_OFFSET);
}

/**
 * Set task priority
 */
export function setPriority(slotIndex: u32, priority: u32): void {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  atomic.store<u32>(slotAddr + SLOT_PRIORITY_OFFSET, priority);
}

/**
 * Get task priority
 */
export function getPriority(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.load<u32>(slotAddr + SLOT_PRIORITY_OFFSET);
}

/**
 * Set task timestamp
 */
export function setTimestamp(slotIndex: u32, timestamp: u64): void {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  atomic.store<u64>(slotAddr + SLOT_TIMESTAMP_OFFSET, timestamp);
}

/**
 * Get task timestamp
 */
export function getTimestamp(slotIndex: u32): u64 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.load<u64>(slotAddr + SLOT_TIMESTAMP_OFFSET);
}

/**
 * Set method ID
 */
export function setMethodId(slotIndex: u32, methodId: u32): void {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  atomic.store<u32>(slotAddr + SLOT_METHOD_OFFSET, methodId);
}

/**
 * Get method ID
 */
export function getMethodId(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.load<u32>(slotAddr + SLOT_METHOD_OFFSET);
}

/**
 * Increment reference count
 */
export function addRef(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.add<u32>(slotAddr + SLOT_REFCOUNT_OFFSET, 1) + 1;
}

/**
 * Decrement reference count and free if zero
 * Returns new reference count
 */
export function release(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  const newCount = atomic.sub<u32>(slotAddr + SLOT_REFCOUNT_OFFSET, 1) - 1;

  if (newCount == 0) {
    freeSlot(slotIndex);
  }

  return newCount;
}

/**
 * Get current reference count
 */
export function getRefCount(slotIndex: u32): u32 {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.load<u32>(slotAddr + SLOT_REFCOUNT_OFFSET);
}

/**
 * Get number of allocated slots
 */
export function getAllocatedCount(): u32 {
  return atomic.load<u32>(HEADER_ALLOCATED_OFFSET);
}

/**
 * Check if slot is allocated
 */
export function isAllocated(slotIndex: u32): bool {
  const slotsBase = getSlotsBase();
  const slotAddr = slotsBase + (slotIndex * SLOT_SIZE);
  return atomic.load<u32>(slotAddr + SLOT_STATE_OFFSET) == SLOT_ALLOCATED;
}

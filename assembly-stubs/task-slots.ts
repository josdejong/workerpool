/**
 * Task Slots Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript task slot
 * allocator functions for unit testing with vitest.
 */

import { SLOT_SIZE, getSlotsBase, getCapacity, validateMemory, _getAllocated, _setAllocated } from './memory';

// Special value for end of free list
const FREE_LIST_END = 0xffffffff;

// Slot states
const SLOT_FREE = 0;
const SLOT_ALLOCATED = 1;

// Internal state for stubs
interface SlotData {
  state: number;
  nextOrId: number;
  priority: number;
  timestamp: bigint;
  methodId: number;
  refCount: number;
}

let _slots: SlotData[] = [];
let _freeListHead = FREE_LIST_END;

/**
 * Initialize task slots with free list
 */
export function initTaskSlots(): void {
  if (!validateMemory()) return;

  const capacity = getCapacity();
  _slots = [];

  // Build free list
  for (let i = 0; i < capacity; i++) {
    _slots.push({
      state: SLOT_FREE,
      nextOrId: i < capacity - 1 ? i + 1 : FREE_LIST_END,
      priority: 0,
      timestamp: BigInt(0),
      methodId: 0,
      refCount: 0,
    });
  }

  _freeListHead = 0;
  _setAllocated(0);
}

/**
 * Allocate a task slot
 */
export function allocateSlot(): number {
  if (!validateMemory()) return FREE_LIST_END;

  if (_freeListHead === FREE_LIST_END) {
    return FREE_LIST_END;
  }

  const slotIndex = _freeListHead;
  const slot = _slots[slotIndex];

  // Advance free list head
  _freeListHead = slot.nextOrId;

  // Mark slot as allocated
  slot.state = SLOT_ALLOCATED;
  slot.refCount = 1;
  _setAllocated(_getAllocated() + 1);

  return slotIndex;
}

/**
 * Free a task slot
 */
export function freeSlot(slotIndex: number): void {
  if (!validateMemory()) return;

  const capacity = getCapacity();
  if (slotIndex >= capacity) return;

  const slot = _slots[slotIndex];

  // Check if already free
  if (slot.state === SLOT_FREE) return;

  // Add to free list
  slot.nextOrId = _freeListHead;
  slot.state = SLOT_FREE;
  _freeListHead = slotIndex;
  _setAllocated(_getAllocated() - 1);
}

/**
 * Set task ID in slot
 */
export function setTaskId(slotIndex: number, taskId: number): void {
  if (_slots[slotIndex]) {
    _slots[slotIndex].nextOrId = taskId;
  }
}

/**
 * Get task ID from slot
 */
export function getTaskId(slotIndex: number): number {
  return _slots[slotIndex]?.nextOrId ?? 0;
}

/**
 * Set task priority
 */
export function setPriority(slotIndex: number, priority: number): void {
  if (_slots[slotIndex]) {
    _slots[slotIndex].priority = priority;
  }
}

/**
 * Get task priority
 */
export function getPriority(slotIndex: number): number {
  return _slots[slotIndex]?.priority ?? 0;
}

/**
 * Set task timestamp
 */
export function setTimestamp(slotIndex: number, timestamp: bigint): void {
  if (_slots[slotIndex]) {
    _slots[slotIndex].timestamp = timestamp;
  }
}

/**
 * Get task timestamp
 */
export function getTimestamp(slotIndex: number): bigint {
  return _slots[slotIndex]?.timestamp ?? BigInt(0);
}

/**
 * Set method ID
 */
export function setMethodId(slotIndex: number, methodId: number): void {
  if (_slots[slotIndex]) {
    _slots[slotIndex].methodId = methodId;
  }
}

/**
 * Get method ID
 */
export function getMethodId(slotIndex: number): number {
  return _slots[slotIndex]?.methodId ?? 0;
}

/**
 * Increment reference count
 */
export function addRef(slotIndex: number): number {
  if (_slots[slotIndex]) {
    _slots[slotIndex].refCount++;
    return _slots[slotIndex].refCount;
  }
  return 0;
}

/**
 * Decrement reference count and free if zero
 */
export function release(slotIndex: number): number {
  if (_slots[slotIndex]) {
    _slots[slotIndex].refCount--;
    const newCount = _slots[slotIndex].refCount;

    if (newCount === 0) {
      freeSlot(slotIndex);
    }

    return newCount;
  }
  return 0;
}

/**
 * Get current reference count
 */
export function getRefCount(slotIndex: number): number {
  return _slots[slotIndex]?.refCount ?? 0;
}

/**
 * Get number of allocated slots
 */
export function getAllocatedCount(): number {
  return _getAllocated();
}

/**
 * Check if slot is allocated
 */
export function isAllocated(slotIndex: number): boolean {
  return _slots[slotIndex]?.state === SLOT_ALLOCATED;
}

/**
 * Reset slots for testing
 */
export function _resetSlots(): void {
  _slots = [];
  _freeListHead = FREE_LIST_END;
}

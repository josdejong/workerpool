/**
 * Task Slots Module Tests
 *
 * Tests for the TypeScript stubs of the AssemblyScript task slots module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initMemory, _resetMemory } from '../../assembly-stubs/memory';
import {
  initTaskSlots,
  allocateSlot,
  freeSlot,
  setTaskId,
  getTaskId,
  setPriority,
  getPriority,
  setTimestamp,
  getTimestamp,
  setMethodId,
  getMethodId,
  addRef,
  release,
  getRefCount,
  getAllocatedCount,
  isAllocated,
  _resetSlots,
} from '../../assembly-stubs/task-slots';

describe('Task Slots Module', () => {
  beforeEach(() => {
    _resetMemory();
    _resetSlots();
    initMemory(8);
    initTaskSlots();
  });

  describe('allocateSlot', () => {
    it('should allocate a slot and return index', () => {
      const slot = allocateSlot();
      expect(slot).toBe(0);
    });

    it('should allocate sequential slots', () => {
      const slot1 = allocateSlot();
      const slot2 = allocateSlot();
      const slot3 = allocateSlot();

      expect(slot1).toBe(0);
      expect(slot2).toBe(1);
      expect(slot3).toBe(2);
    });

    it('should return 0xFFFFFFFF when no slots available', () => {
      // Allocate all slots
      for (let i = 0; i < 8; i++) {
        allocateSlot();
      }

      expect(allocateSlot()).toBe(0xffffffff);
    });

    it('should return 0xFFFFFFFF when memory not initialized', () => {
      _resetMemory();
      _resetSlots();
      expect(allocateSlot()).toBe(0xffffffff);
    });
  });

  describe('freeSlot', () => {
    it('should free an allocated slot', () => {
      const slot = allocateSlot();
      expect(getAllocatedCount()).toBe(1);

      freeSlot(slot);
      expect(getAllocatedCount()).toBe(0);
    });

    it('should allow re-allocation of freed slot', () => {
      const slot1 = allocateSlot();
      const slot2 = allocateSlot();

      freeSlot(slot1);

      // The freed slot should be re-allocated
      const slot3 = allocateSlot();
      expect(slot3).toBe(slot1);
    });

    it('should handle freeing already free slot', () => {
      const slot = allocateSlot();
      freeSlot(slot);
      freeSlot(slot); // Should not throw

      expect(getAllocatedCount()).toBe(0);
    });
  });

  describe('Task ID', () => {
    it('should set and get task ID', () => {
      const slot = allocateSlot();
      setTaskId(slot, 12345);
      expect(getTaskId(slot)).toBe(12345);
    });

    it('should handle multiple slots', () => {
      const slot1 = allocateSlot();
      const slot2 = allocateSlot();

      setTaskId(slot1, 100);
      setTaskId(slot2, 200);

      expect(getTaskId(slot1)).toBe(100);
      expect(getTaskId(slot2)).toBe(200);
    });
  });

  describe('Priority', () => {
    it('should set and get priority', () => {
      const slot = allocateSlot();
      setPriority(slot, 5);
      expect(getPriority(slot)).toBe(5);
    });

    it('should default to 0', () => {
      const slot = allocateSlot();
      expect(getPriority(slot)).toBe(0);
    });
  });

  describe('Timestamp', () => {
    it('should set and get timestamp', () => {
      const slot = allocateSlot();
      const timestamp = BigInt(Date.now());
      setTimestamp(slot, timestamp);
      expect(getTimestamp(slot)).toBe(timestamp);
    });

    it('should handle large timestamps', () => {
      const slot = allocateSlot();
      const largeTimestamp = BigInt('9007199254740991'); // MAX_SAFE_INTEGER
      setTimestamp(slot, largeTimestamp);
      expect(getTimestamp(slot)).toBe(largeTimestamp);
    });
  });

  describe('Method ID', () => {
    it('should set and get method ID', () => {
      const slot = allocateSlot();
      setMethodId(slot, 42);
      expect(getMethodId(slot)).toBe(42);
    });

    it('should default to 0', () => {
      const slot = allocateSlot();
      expect(getMethodId(slot)).toBe(0);
    });
  });

  describe('Reference Counting', () => {
    it('should start with refCount of 1', () => {
      const slot = allocateSlot();
      expect(getRefCount(slot)).toBe(1);
    });

    it('should increment refCount with addRef', () => {
      const slot = allocateSlot();
      expect(addRef(slot)).toBe(2);
      expect(getRefCount(slot)).toBe(2);
    });

    it('should decrement refCount with release', () => {
      const slot = allocateSlot();
      addRef(slot); // refCount = 2
      expect(release(slot)).toBe(1);
      expect(getRefCount(slot)).toBe(1);
    });

    it('should free slot when refCount reaches 0', () => {
      const slot = allocateSlot();
      expect(isAllocated(slot)).toBe(true);

      release(slot); // refCount = 0

      expect(isAllocated(slot)).toBe(false);
    });

    it('should handle multiple refs', () => {
      const slot = allocateSlot();
      addRef(slot); // 2
      addRef(slot); // 3
      addRef(slot); // 4

      expect(getRefCount(slot)).toBe(4);

      release(slot); // 3
      release(slot); // 2
      expect(isAllocated(slot)).toBe(true);

      release(slot); // 1
      expect(isAllocated(slot)).toBe(true);

      release(slot); // 0
      expect(isAllocated(slot)).toBe(false);
    });
  });

  describe('getAllocatedCount', () => {
    it('should return 0 initially', () => {
      expect(getAllocatedCount()).toBe(0);
    });

    it('should increase on allocation', () => {
      allocateSlot();
      expect(getAllocatedCount()).toBe(1);

      allocateSlot();
      expect(getAllocatedCount()).toBe(2);
    });

    it('should decrease on free', () => {
      const slot = allocateSlot();
      allocateSlot();
      expect(getAllocatedCount()).toBe(2);

      freeSlot(slot);
      expect(getAllocatedCount()).toBe(1);
    });
  });

  describe('isAllocated', () => {
    it('should return false for unallocated slot', () => {
      expect(isAllocated(0)).toBe(false);
    });

    it('should return true for allocated slot', () => {
      const slot = allocateSlot();
      expect(isAllocated(slot)).toBe(true);
    });

    it('should return false after slot is freed', () => {
      const slot = allocateSlot();
      freeSlot(slot);
      expect(isAllocated(slot)).toBe(false);
    });
  });
});

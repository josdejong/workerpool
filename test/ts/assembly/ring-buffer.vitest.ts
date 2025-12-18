/**
 * Ring Buffer Module Tests
 *
 * Tests for the TypeScript stubs of the AssemblyScript ring buffer module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initMemory, _resetMemory } from '../../../assembly-stubs/memory';
import {
  packEntry,
  unpackSlotIndex,
  unpackPriority,
  push,
  pop,
  size,
  isEmpty,
  isFull,
  clear,
  contains,
} from '../../../assembly-stubs/ring-buffer';

describe('Ring Buffer Module', () => {
  beforeEach(() => {
    _resetMemory();
    initMemory(8); // Small capacity for testing
  });

  describe('packEntry / unpackSlotIndex / unpackPriority', () => {
    it('should pack and unpack slot index correctly', () => {
      const entry = packEntry(42, 0);
      expect(unpackSlotIndex(entry)).toBe(42);
    });

    it('should pack and unpack priority correctly', () => {
      const entry = packEntry(0, 100);
      expect(unpackPriority(entry)).toBe(100);
    });

    it('should pack and unpack both values correctly', () => {
      const entry = packEntry(123, 456);
      expect(unpackSlotIndex(entry)).toBe(123);
      expect(unpackPriority(entry)).toBe(456);
    });

    it('should handle max values', () => {
      const entry = packEntry(0xffffffff, 0xffffffff);
      expect(unpackSlotIndex(entry)).toBe(0xffffffff);
      expect(unpackPriority(entry)).toBe(0xffffffff);
    });
  });

  describe('push', () => {
    it('should push an entry successfully', () => {
      expect(push(1, 0)).toBe(true);
      expect(size()).toBe(1);
    });

    it('should push multiple entries', () => {
      push(1, 0);
      push(2, 0);
      push(3, 0);
      expect(size()).toBe(3);
    });

    it('should return false when buffer is full', () => {
      // Fill buffer
      for (let i = 0; i < 8; i++) {
        expect(push(i, 0)).toBe(true);
      }
      expect(push(9, 0)).toBe(false);
    });

    it('should return false when memory not initialized', () => {
      _resetMemory();
      expect(push(1, 0)).toBe(false);
    });
  });

  describe('pop', () => {
    it('should pop entries in FIFO order', () => {
      push(1, 0);
      push(2, 0);
      push(3, 0);

      expect(unpackSlotIndex(pop())).toBe(1);
      expect(unpackSlotIndex(pop())).toBe(2);
      expect(unpackSlotIndex(pop())).toBe(3);
    });

    it('should return 0 for empty buffer', () => {
      expect(pop()).toBe(BigInt(0));
    });

    it('should return 0 when memory not initialized', () => {
      _resetMemory();
      expect(pop()).toBe(BigInt(0));
    });

    it('should preserve priority on pop', () => {
      push(1, 100);
      const entry = pop();
      expect(unpackSlotIndex(entry)).toBe(1);
      expect(unpackPriority(entry)).toBe(100);
    });
  });

  describe('size', () => {
    it('should return 0 for empty buffer', () => {
      expect(size()).toBe(0);
    });

    it('should return correct size after pushes', () => {
      push(1, 0);
      expect(size()).toBe(1);

      push(2, 0);
      expect(size()).toBe(2);

      push(3, 0);
      expect(size()).toBe(3);
    });

    it('should return correct size after push and pop', () => {
      push(1, 0);
      push(2, 0);
      pop();
      expect(size()).toBe(1);
    });

    it('should return 0 when memory not initialized', () => {
      _resetMemory();
      expect(size()).toBe(0);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty buffer', () => {
      expect(isEmpty()).toBe(true);
    });

    it('should return false after push', () => {
      push(1, 0);
      expect(isEmpty()).toBe(false);
    });

    it('should return true after all entries popped', () => {
      push(1, 0);
      pop();
      expect(isEmpty()).toBe(true);
    });
  });

  describe('isFull', () => {
    it('should return false for empty buffer', () => {
      expect(isFull()).toBe(false);
    });

    it('should return false for partially full buffer', () => {
      push(1, 0);
      push(2, 0);
      expect(isFull()).toBe(false);
    });

    it('should return true when buffer is full', () => {
      for (let i = 0; i < 8; i++) {
        push(i, 0);
      }
      expect(isFull()).toBe(true);
    });

    it('should return true when memory not initialized', () => {
      _resetMemory();
      expect(isFull()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      push(1, 0);
      push(2, 0);
      push(3, 0);

      clear();

      expect(size()).toBe(0);
      expect(isEmpty()).toBe(true);
    });

    it('should allow pushes after clear', () => {
      push(1, 0);
      clear();
      expect(push(2, 0)).toBe(true);
      expect(size()).toBe(1);
    });
  });

  describe('contains', () => {
    it('should return false for empty buffer', () => {
      expect(contains(1)).toBe(false);
    });

    it('should return true if slot index exists', () => {
      push(1, 0);
      push(2, 0);
      push(3, 0);

      expect(contains(1)).toBe(true);
      expect(contains(2)).toBe(true);
      expect(contains(3)).toBe(true);
    });

    it('should return false if slot index does not exist', () => {
      push(1, 0);
      push(2, 0);

      expect(contains(3)).toBe(false);
      expect(contains(100)).toBe(false);
    });

    it('should return false after entry is popped', () => {
      push(1, 0);
      pop();
      expect(contains(1)).toBe(false);
    });

    it('should return false when memory not initialized', () => {
      _resetMemory();
      expect(contains(1)).toBe(false);
    });
  });
});

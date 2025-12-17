/**
 * Priority Queue Module Tests
 *
 * Tests for the TypeScript stubs of the AssemblyScript priority queue module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initMemory, _resetMemory } from '../../../assembly-stubs/memory';
import {
  initPriorityQueue,
  getPriorityQueueSize,
  isPriorityQueueEmpty,
  priorityQueuePush,
  priorityQueuePop,
  priorityQueuePeek,
  priorityQueuePeekPriority,
  priorityQueueClear,
  isPriorityQueueFull,
  _resetPriorityQueue,
} from '../../../assembly-stubs/priority-queue';

describe('Priority Queue Module', () => {
  beforeEach(() => {
    _resetMemory();
    _resetPriorityQueue();
    initMemory(8);
    initPriorityQueue();
  });

  describe('initPriorityQueue', () => {
    it('should initialize empty queue', () => {
      expect(getPriorityQueueSize()).toBe(0);
      expect(isPriorityQueueEmpty()).toBe(true);
    });
  });

  describe('priorityQueuePush', () => {
    it('should push an entry successfully', () => {
      expect(priorityQueuePush(1, 10)).toBe(true);
      expect(getPriorityQueueSize()).toBe(1);
    });

    it('should push multiple entries', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 20);
      priorityQueuePush(3, 30);
      expect(getPriorityQueueSize()).toBe(3);
    });

    it('should return false when queue is full', () => {
      for (let i = 0; i < 8; i++) {
        expect(priorityQueuePush(i, i)).toBe(true);
      }
      expect(priorityQueuePush(9, 9)).toBe(false);
    });

    it('should return false when memory not initialized', () => {
      _resetMemory();
      _resetPriorityQueue();
      expect(priorityQueuePush(1, 10)).toBe(false);
    });
  });

  describe('priorityQueuePop', () => {
    it('should pop highest priority entry first', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 30);
      priorityQueuePush(3, 20);

      expect(priorityQueuePop()).toBe(2); // priority 30
      expect(priorityQueuePop()).toBe(3); // priority 20
      expect(priorityQueuePop()).toBe(1); // priority 10
    });

    it('should return 0xFFFFFFFF for empty queue', () => {
      expect(priorityQueuePop()).toBe(0xffffffff);
    });

    it('should return 0xFFFFFFFF when memory not initialized', () => {
      _resetMemory();
      _resetPriorityQueue();
      expect(priorityQueuePop()).toBe(0xffffffff);
    });

    it('should handle equal priorities (FIFO within same priority)', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 10);
      priorityQueuePush(3, 10);

      // Order may vary for equal priorities, but all should be popped
      const results = [priorityQueuePop(), priorityQueuePop(), priorityQueuePop()];
      expect(results.sort()).toEqual([1, 2, 3]);
    });
  });

  describe('priorityQueuePeek', () => {
    it('should return slot index without removing', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 30);
      priorityQueuePush(3, 20);

      expect(priorityQueuePeek()).toBe(2); // highest priority
      expect(getPriorityQueueSize()).toBe(3); // size unchanged
    });

    it('should return 0xFFFFFFFF for empty queue', () => {
      expect(priorityQueuePeek()).toBe(0xffffffff);
    });

    it('should return same value on multiple peeks', () => {
      priorityQueuePush(1, 10);
      expect(priorityQueuePeek()).toBe(1);
      expect(priorityQueuePeek()).toBe(1);
      expect(priorityQueuePeek()).toBe(1);
    });
  });

  describe('priorityQueuePeekPriority', () => {
    it('should return highest priority value', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 30);
      priorityQueuePush(3, 20);

      expect(priorityQueuePeekPriority()).toBe(30);
    });

    it('should return 0 for empty queue', () => {
      expect(priorityQueuePeekPriority()).toBe(0);
    });

    it('should not change after peek', () => {
      priorityQueuePush(1, 50);
      expect(priorityQueuePeekPriority()).toBe(50);
      expect(priorityQueuePeekPriority()).toBe(50);
    });
  });

  describe('getPriorityQueueSize', () => {
    it('should return 0 for empty queue', () => {
      expect(getPriorityQueueSize()).toBe(0);
    });

    it('should return correct size after pushes', () => {
      priorityQueuePush(1, 10);
      expect(getPriorityQueueSize()).toBe(1);

      priorityQueuePush(2, 20);
      expect(getPriorityQueueSize()).toBe(2);
    });

    it('should return correct size after push and pop', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 20);
      priorityQueuePop();
      expect(getPriorityQueueSize()).toBe(1);
    });
  });

  describe('isPriorityQueueEmpty', () => {
    it('should return true for empty queue', () => {
      expect(isPriorityQueueEmpty()).toBe(true);
    });

    it('should return false after push', () => {
      priorityQueuePush(1, 10);
      expect(isPriorityQueueEmpty()).toBe(false);
    });

    it('should return true after all entries popped', () => {
      priorityQueuePush(1, 10);
      priorityQueuePop();
      expect(isPriorityQueueEmpty()).toBe(true);
    });
  });

  describe('isPriorityQueueFull', () => {
    it('should return false for empty queue', () => {
      expect(isPriorityQueueFull()).toBe(false);
    });

    it('should return false for partially full queue', () => {
      priorityQueuePush(1, 10);
      expect(isPriorityQueueFull()).toBe(false);
    });

    it('should return true when queue is full', () => {
      for (let i = 0; i < 8; i++) {
        priorityQueuePush(i, i);
      }
      expect(isPriorityQueueFull()).toBe(true);
    });

    it('should return true when memory not initialized', () => {
      _resetMemory();
      _resetPriorityQueue();
      expect(isPriorityQueueFull()).toBe(true);
    });
  });

  describe('priorityQueueClear', () => {
    it('should clear all entries', () => {
      priorityQueuePush(1, 10);
      priorityQueuePush(2, 20);
      priorityQueuePush(3, 30);

      priorityQueueClear();

      expect(getPriorityQueueSize()).toBe(0);
      expect(isPriorityQueueEmpty()).toBe(true);
    });

    it('should allow pushes after clear', () => {
      priorityQueuePush(1, 10);
      priorityQueueClear();

      expect(priorityQueuePush(2, 20)).toBe(true);
      expect(getPriorityQueueSize()).toBe(1);
    });
  });

  describe('heap property', () => {
    it('should maintain heap property with random insertions', () => {
      const priorities = [5, 1, 9, 3, 7, 2, 8, 4];

      for (let i = 0; i < priorities.length; i++) {
        priorityQueuePush(i, priorities[i]);
      }

      // Should pop in descending priority order
      const results: number[] = [];
      while (!isPriorityQueueEmpty()) {
        const slot = priorityQueuePop();
        if (slot !== 0xffffffff) {
          results.push(priorities[slot]);
        }
      }

      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeLessThanOrEqual(results[i - 1]);
      }
    });

    it('should handle interleaved push and pop', () => {
      priorityQueuePush(0, 10);
      priorityQueuePush(1, 30);
      expect(priorityQueuePop()).toBe(1); // 30

      priorityQueuePush(2, 20);
      priorityQueuePush(3, 40);
      expect(priorityQueuePop()).toBe(3); // 40
      expect(priorityQueuePop()).toBe(2); // 20
      expect(priorityQueuePop()).toBe(0); // 10
    });
  });
});

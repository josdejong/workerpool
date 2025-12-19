/**
 * Tests for AssemblyScript Circular Buffer
 *
 * Uses pure TypeScript stubs for testing the circular buffer logic
 * that will compile to WASM.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initBuffer,
  getBufferCapacity,
  getBufferSize,
  isEmpty,
  isFull,
  pushGrowable,
  pushWithEviction,
  shift,
  peekHead,
  peekTail,
  at,
  clear,
  drain,
  getStats,
  logicalToPhysical,
  getHead,
  getTail,
  getBufferMask,
  _reset,
  _getDataAt,
  _setDataAt,
} from '../../../src/ts/assembly/stubs/circular-buffer';

describe('AssemblyScript Circular Buffer', () => {
  beforeEach(() => {
    _reset();
  });

  describe('initialization', () => {
    it('should initialize with power-of-2 capacity', () => {
      initBuffer(10);
      expect(getBufferCapacity()).toBe(16); // Next power of 2
    });

    it('should initialize with exact power-of-2', () => {
      initBuffer(8);
      expect(getBufferCapacity()).toBe(8);
    });

    it('should start empty', () => {
      initBuffer(16);
      expect(getBufferSize()).toBe(0);
      expect(isEmpty()).toBe(true);
      expect(isFull()).toBe(false);
    });

    it('should set mask correctly', () => {
      initBuffer(16);
      expect(getBufferMask()).toBe(15); // 16 - 1
    });
  });

  describe('pushGrowable', () => {
    it('should push items and increase size', () => {
      initBuffer(4);
      pushGrowable(100);
      expect(getBufferSize()).toBe(1);
      expect(isEmpty()).toBe(false);
    });

    it('should return correct index', () => {
      initBuffer(4);
      expect(pushGrowable(100)).toBe(0);
      expect(pushGrowable(200)).toBe(1);
      expect(pushGrowable(300)).toBe(2);
    });

    it('should grow when full', () => {
      initBuffer(2);
      pushGrowable(100);
      pushGrowable(200);
      expect(isFull()).toBe(true);

      // This should trigger growth
      pushGrowable(300);
      expect(getBufferCapacity()).toBe(4);
      expect(getBufferSize()).toBe(3);
      expect(isFull()).toBe(false);
    });

    it('should preserve order after growth', () => {
      initBuffer(2);
      pushGrowable(100);
      _setDataAt(0, 100);
      pushGrowable(200);
      _setDataAt(1, 200);

      // Trigger growth
      pushGrowable(300);

      // Verify order is preserved
      expect(_getDataAt(0)).toBe(100);
      expect(_getDataAt(1)).toBe(200);
    });
  });

  describe('pushWithEviction', () => {
    it('should push without eviction when not full', () => {
      initBuffer(4);
      expect(pushWithEviction(100)).toBe(-1);
      expect(getBufferSize()).toBe(1);
    });

    it('should evict oldest when full', () => {
      initBuffer(2);
      pushWithEviction(100);
      pushWithEviction(200);
      expect(isFull()).toBe(true);

      // Should evict index 0
      const evictedIndex = pushWithEviction(300);
      expect(evictedIndex).toBe(0);
      expect(getBufferSize()).toBe(2);
    });

    it('should maintain fixed capacity', () => {
      initBuffer(2);
      for (let i = 0; i < 10; i++) {
        pushWithEviction(i);
      }
      expect(getBufferCapacity()).toBe(2);
      expect(getBufferSize()).toBe(2);
    });
  });

  describe('shift', () => {
    it('should return -1 for empty buffer', () => {
      initBuffer(4);
      expect(shift()).toBe(-1);
    });

    it('should return correct index and decrease size', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);

      expect(shift()).toBe(0);
      expect(getBufferSize()).toBe(1);
      expect(shift()).toBe(1);
      expect(getBufferSize()).toBe(0);
    });

    it('should update head pointer', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);

      expect(getHead()).toBe(0);
      shift();
      expect(getHead()).toBe(1);
    });
  });

  describe('peek operations', () => {
    it('peekHead should return -1 for empty buffer', () => {
      initBuffer(4);
      expect(peekHead()).toBe(-1);
    });

    it('peekHead should return oldest item index', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);
      expect(peekHead()).toBe(0);
    });

    it('peekTail should return -1 for empty buffer', () => {
      initBuffer(4);
      expect(peekTail()).toBe(-1);
    });

    it('peekTail should return newest item index', () => {
      initBuffer(4);
      pushGrowable(100);
      expect(peekTail()).toBe(0);
      pushGrowable(200);
      expect(peekTail()).toBe(1);
    });
  });

  describe('at', () => {
    it('should return -1 for out of bounds', () => {
      initBuffer(4);
      pushGrowable(100);
      expect(at(1)).toBe(-1);
      expect(at(100)).toBe(-1);
    });

    it('should return correct physical index', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);
      pushGrowable(300);

      expect(at(0)).toBe(0);
      expect(at(1)).toBe(1);
      expect(at(2)).toBe(2);
    });

    it('should work with wraparound', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);
      shift();
      shift();
      pushGrowable(300);
      pushGrowable(400);
      pushGrowable(500);

      // Head is at 2, items are at 2, 3, 0
      expect(at(0)).toBe(2);
      expect(at(1)).toBe(3);
      expect(at(2)).toBe(0);
    });
  });

  describe('clear', () => {
    it('should reset buffer state', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);
      pushGrowable(300);

      clear();

      expect(getBufferSize()).toBe(0);
      expect(isEmpty()).toBe(true);
      expect(getHead()).toBe(0);
      expect(getTail()).toBe(0);
    });
  });

  describe('drain', () => {
    it('should return count and clear buffer', () => {
      initBuffer(4);
      pushGrowable(100);
      pushGrowable(200);
      pushGrowable(300);

      const count = drain();

      expect(count).toBe(3);
      expect(getBufferSize()).toBe(0);
      expect(isEmpty()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should pack capacity and size', () => {
      initBuffer(16);
      pushGrowable(100);
      pushGrowable(200);
      pushGrowable(300);

      const stats = getStats();
      const capacity = stats >> 16;
      const size = stats & 0xffff;

      expect(capacity).toBe(16);
      expect(size).toBe(3);
    });
  });

  describe('logicalToPhysical', () => {
    it('should convert correctly without wraparound', () => {
      initBuffer(8);
      pushGrowable(100);
      pushGrowable(200);

      expect(logicalToPhysical(0)).toBe(0);
      expect(logicalToPhysical(1)).toBe(1);
    });

    it('should convert correctly with wraparound', () => {
      initBuffer(4);
      pushGrowable(1);
      pushGrowable(2);
      pushGrowable(3);
      shift();
      shift();
      pushGrowable(4);
      pushGrowable(5);

      // Head is at 2, items at physical 2, 3, 0, 1
      expect(logicalToPhysical(0)).toBe(2);
      expect(logicalToPhysical(1)).toBe(3);
      expect(logicalToPhysical(2)).toBe(0);
      expect(logicalToPhysical(3)).toBe(1);
    });
  });

  describe('FIFO behavior', () => {
    it('should maintain FIFO order', () => {
      initBuffer(4);

      _setDataAt(pushGrowable(0), 100);
      _setDataAt(pushGrowable(0), 200);
      _setDataAt(pushGrowable(0), 300);

      expect(_getDataAt(shift())).toBe(100);
      expect(_getDataAt(shift())).toBe(200);
      expect(_getDataAt(shift())).toBe(300);
    });

    it('should handle mixed push/shift', () => {
      initBuffer(4);

      _setDataAt(pushGrowable(0), 100);
      _setDataAt(pushGrowable(0), 200);
      expect(_getDataAt(shift())).toBe(100);

      _setDataAt(pushGrowable(0), 300);
      expect(_getDataAt(shift())).toBe(200);
      expect(_getDataAt(shift())).toBe(300);
    });
  });

  describe('stress test', () => {
    it('should handle many operations', () => {
      initBuffer(16);

      // Push 1000 items with growth
      for (let i = 0; i < 1000; i++) {
        pushGrowable(i);
      }

      expect(getBufferSize()).toBe(1000);
      expect(getBufferCapacity()).toBeGreaterThanOrEqual(1000);

      // Shift half
      for (let i = 0; i < 500; i++) {
        shift();
      }

      expect(getBufferSize()).toBe(500);
    });

    it('should handle circular wraparound', () => {
      initBuffer(4);

      // Fill and drain multiple times
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 4; i++) {
          pushWithEviction(i);
        }
        for (let i = 0; i < 4; i++) {
          shift();
        }
      }

      expect(isEmpty()).toBe(true);
    });
  });
});

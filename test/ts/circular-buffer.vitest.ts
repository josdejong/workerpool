/**
 * Tests for CircularBuffer and TimeWindowBuffer
 *
 * These are pure TypeScript implementations for O(1) operations
 * in the MetricsCollector and other core modules.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CircularBuffer, TimeWindowBuffer, TimestampedValue } from '../../src/ts/core/circular-buffer';

describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('should create buffer with specified capacity', () => {
      const buffer = new CircularBuffer<number>(10);
      expect(buffer.maxCapacity).toBe(10);
      expect(buffer.size).toBe(0);
    });

    it('should throw error for zero capacity', () => {
      expect(() => new CircularBuffer<number>(0)).toThrow('Capacity must be positive');
    });

    it('should throw error for negative capacity', () => {
      expect(() => new CircularBuffer<number>(-5)).toThrow('Capacity must be positive');
    });
  });

  describe('push', () => {
    it('should add elements to buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should evict oldest element when full', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Should evict 1

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    it('should handle multiple evictions', () => {
      const buffer = new CircularBuffer<number>(3);
      for (let i = 1; i <= 10; i++) {
        buffer.push(i);
      }

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([8, 9, 10]);
    });
  });

  describe('peek', () => {
    it('should return oldest element without removing it', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.peek()).toBe(1);
      expect(buffer.size).toBe(3);
    });

    it('should return undefined for empty buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.peek()).toBeUndefined();
    });
  });

  describe('peekLast', () => {
    it('should return newest element without removing it', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.peekLast()).toBe(3);
      expect(buffer.size).toBe(3);
    });

    it('should return undefined for empty buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.peekLast()).toBeUndefined();
    });
  });

  describe('shift', () => {
    it('should remove and return oldest element', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.shift()).toBe(1);
      expect(buffer.size).toBe(2);
      expect(buffer.toArray()).toEqual([2, 3]);
    });

    it('should return undefined for empty buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.shift()).toBeUndefined();
    });

    it('should handle shift after eviction', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Evicts 1

      expect(buffer.shift()).toBe(2);
      expect(buffer.toArray()).toEqual([3, 4]);
    });
  });

  describe('at', () => {
    it('should return element at index', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);

      expect(buffer.at(0)).toBe(10);
      expect(buffer.at(1)).toBe(20);
      expect(buffer.at(2)).toBe(30);
    });

    it('should return undefined for out of bounds index', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);

      expect(buffer.at(-1)).toBeUndefined();
      expect(buffer.at(2)).toBeUndefined();
      expect(buffer.at(100)).toBeUndefined();
    });

    it('should work correctly after wraparound', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.at(0)).toBe(3);
      expect(buffer.at(1)).toBe(4);
      expect(buffer.at(2)).toBe(5);
    });
  });

  describe('clear', () => {
    it('should remove all elements', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.toArray()).toEqual([]);
    });
  });

  describe('isEmpty and isFull', () => {
    it('should correctly report empty state', () => {
      const buffer = new CircularBuffer<number>(3);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.isFull).toBe(false);

      buffer.push(1);
      expect(buffer.isEmpty).toBe(false);
      expect(buffer.isFull).toBe(false);
    });

    it('should correctly report full state', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.isEmpty).toBe(false);
      expect(buffer.isFull).toBe(true);
    });
  });

  describe('toArray', () => {
    it('should return copy of elements in order', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      const arr = buffer.toArray();
      expect(arr).toEqual([1, 2, 3]);

      // Modifying array shouldn't affect buffer
      arr[0] = 100;
      expect(buffer.at(0)).toBe(1);
    });

    it('should handle wraparound correctly', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);

      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });
  });

  describe('filter', () => {
    it('should return elements matching predicate', () => {
      const buffer = new CircularBuffer<number>(10);
      for (let i = 1; i <= 10; i++) {
        buffer.push(i);
      }

      const evens = buffer.filter(x => x % 2 === 0);
      expect(evens).toEqual([2, 4, 6, 8, 10]);
    });

    it('should return empty array when no match', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(3);
      buffer.push(5);

      const evens = buffer.filter(x => x % 2 === 0);
      expect(evens).toEqual([]);
    });
  });

  describe('reduce', () => {
    it('should reduce all elements', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      const sum = buffer.reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(15);
    });

    it('should return initial value for empty buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      const sum = buffer.reduce((acc, val) => acc + val, 100);
      expect(sum).toBe(100);
    });
  });

  describe('iterator', () => {
    it('should support for...of iteration', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      const values: number[] = [];
      for (const val of buffer) {
        values.push(val);
      }

      expect(values).toEqual([1, 2, 3]);
    });

    it('should support spread operator', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect([...buffer]).toEqual([1, 2, 3]);
    });
  });

  describe('object types', () => {
    it('should work with objects', () => {
      interface Item {
        id: number;
        name: string;
      }

      const buffer = new CircularBuffer<Item>(3);
      buffer.push({ id: 1, name: 'a' });
      buffer.push({ id: 2, name: 'b' });
      buffer.push({ id: 3, name: 'c' });
      buffer.push({ id: 4, name: 'd' });

      expect(buffer.toArray()).toEqual([
        { id: 2, name: 'b' },
        { id: 3, name: 'c' },
        { id: 4, name: 'd' },
      ]);
    });
  });
});

describe('TimeWindowBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create buffer with time window', () => {
      const buffer = new TimeWindowBuffer<number>(60000); // 1 minute
      expect(buffer.size).toBe(0);
    });
  });

  describe('push', () => {
    it('should add values with timestamps', () => {
      const buffer = new TimeWindowBuffer<number>(60000);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.size).toBe(3);
    });

    it('should use current time for timestamp', () => {
      const buffer = new TimeWindowBuffer<number>(60000);

      buffer.push(1);
      vi.advanceTimersByTime(1000);
      buffer.push(2);
      vi.advanceTimersByTime(1000);
      buffer.push(3);

      const timestamped = buffer.getTimestampedValues();
      expect(timestamped.length).toBe(3);
    });
  });

  describe('pushAt', () => {
    it('should add value with specific timestamp', () => {
      const buffer = new TimeWindowBuffer<number>(60000);
      const now = Date.now();

      buffer.pushAt(now - 1000, 1);
      buffer.pushAt(now, 2);
      buffer.pushAt(now + 1000, 3);

      expect(buffer.size).toBe(3);
    });
  });

  describe('getValues', () => {
    it('should return values within time window', () => {
      const buffer = new TimeWindowBuffer<number>(5000); // 5 second window

      buffer.push(1);
      vi.advanceTimersByTime(2000);
      buffer.push(2);
      vi.advanceTimersByTime(2000);
      buffer.push(3);
      vi.advanceTimersByTime(2000); // Now 6 seconds have passed since first push

      // Value 1 should be outside the window
      const values = buffer.getValues();
      expect(values).toEqual([2, 3]);
    });

    it('should return empty array when all values outside window', () => {
      const buffer = new TimeWindowBuffer<number>(1000); // 1 second window

      buffer.push(1);
      buffer.push(2);

      vi.advanceTimersByTime(2000); // Move 2 seconds forward

      const values = buffer.getValues();
      expect(values).toEqual([]);
    });
  });

  describe('getTimestampedValues', () => {
    it('should return values with timestamps within window', () => {
      const buffer = new TimeWindowBuffer<number>(5000);
      const now = Date.now();

      buffer.push(1);
      vi.advanceTimersByTime(2000);
      buffer.push(2);

      const timestamped = buffer.getTimestampedValues();
      expect(timestamped.length).toBe(2);
      expect(timestamped[0].value).toBe(1);
      expect(timestamped[1].value).toBe(2);
    });
  });

  describe('countInWindow', () => {
    it('should count values within time window', () => {
      const buffer = new TimeWindowBuffer<number>(5000);

      buffer.push(1);
      vi.advanceTimersByTime(2000);
      buffer.push(2);
      vi.advanceTimersByTime(2000);
      buffer.push(3);
      vi.advanceTimersByTime(2000);

      expect(buffer.countInWindow()).toBe(2); // Only 2 and 3 are within 5 seconds
    });
  });

  describe('sumInWindow', () => {
    it('should sum numeric values within window', () => {
      const buffer = new TimeWindowBuffer<number>(5000);

      buffer.push(10);
      vi.advanceTimersByTime(2000);
      buffer.push(20);
      vi.advanceTimersByTime(2000);
      buffer.push(30);
      vi.advanceTimersByTime(2000);

      expect(buffer.sumInWindow()).toBe(50); // 20 + 30
    });
  });

  describe('clear', () => {
    it('should remove all values', () => {
      const buffer = new TimeWindowBuffer<number>(60000);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.getValues()).toEqual([]);
    });
  });

  describe('toArray', () => {
    it('should return all values regardless of time window', () => {
      const buffer = new TimeWindowBuffer<number>(1000);

      buffer.push(1);
      vi.advanceTimersByTime(2000);
      buffer.push(2);

      // toArray returns all values, not filtered by time
      expect(buffer.toArray()).toEqual([1, 2]);
    });
  });

  describe('max size limit', () => {
    it('should respect max size limit', () => {
      const buffer = new TimeWindowBuffer<number>(60000, 5); // Max 5 elements

      for (let i = 1; i <= 10; i++) {
        buffer.push(i);
      }

      expect(buffer.size).toBe(5);
      expect(buffer.toArray()).toEqual([6, 7, 8, 9, 10]);
    });
  });
});

describe('CircularBuffer Performance', () => {
  it('should handle high volume push operations efficiently', () => {
    const buffer = new CircularBuffer<number>(1000);
    const iterations = 100000;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      buffer.push(i);
    }
    const duration = performance.now() - start;

    // Should complete 100k operations in under 100ms
    expect(duration).toBeLessThan(100);
    expect(buffer.size).toBe(1000);
  });

  it('should maintain O(1) push regardless of buffer size', () => {
    const smallBuffer = new CircularBuffer<number>(100);
    const largeBuffer = new CircularBuffer<number>(10000);
    const iterations = 50000;

    const startSmall = performance.now();
    for (let i = 0; i < iterations; i++) {
      smallBuffer.push(i);
    }
    const durationSmall = performance.now() - startSmall;

    const startLarge = performance.now();
    for (let i = 0; i < iterations; i++) {
      largeBuffer.push(i);
    }
    const durationLarge = performance.now() - startLarge;

    // Times should be similar (within 2x) regardless of buffer size
    const ratio = durationLarge / durationSmall;
    expect(ratio).toBeLessThan(2);
  });
});

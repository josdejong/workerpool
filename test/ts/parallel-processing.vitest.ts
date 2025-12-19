/**
 * Tests for parallel processing functions
 *
 * Uses MainThreadExecutor to test the parallel processing functions
 * without requiring worker files. The functions work the same way,
 * just executed sequentially on the main thread.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MainThreadExecutor } from '../../src/ts/core/main-thread-executor';

describe('Parallel Processing', () => {
  let executor: MainThreadExecutor;

  beforeEach(() => {
    executor = new MainThreadExecutor({
      methods: {
        double: (x: number) => x * 2,
      },
    });
  });

  afterEach(async () => {
    await executor.terminate();
  });

  describe('reduce', () => {
    it('should reduce an array to a sum', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      const sum = await executor.reduce(
        items,
        (acc: number, x: number) => acc + x,
        (left: number, right: number) => left + right,
        { initialValue: 0 }
      );
      expect(sum).toBe(36);
    });

    it('should reduce with custom initial value', async () => {
      const items = [1, 2, 3];
      const result = await executor.reduce(
        items,
        (acc: number, x: number) => acc + x,
        (left: number, right: number) => left + right,
        { initialValue: 10 }
      );
      expect(result).toBe(16);
    });

    it('should handle empty array', async () => {
      const result = await executor.reduce(
        [],
        (acc: number, x: number) => acc + x,
        (left: number, right: number) => left + right,
        { initialValue: 0 }
      );
      expect(result).toBe(0);
    });
  });

  describe('forEach', () => {
    it('should process all items', async () => {
      const items = [1, 2, 3, 4, 5];
      const result = await executor.forEach(items, (x: number) => x * 2);
      expect(result.processed).toBe(5);
      expect(result.cancelled).toBe(false);
    });

    it('should handle empty array', async () => {
      const result = await executor.forEach([], (x: number) => x * 2);
      expect(result.processed).toBe(0);
    });
  });

  describe('filter', () => {
    it('should filter even numbers', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      const evens = await executor.filter(items, (x: number) => x % 2 === 0);
      expect(evens).toEqual([2, 4, 6, 8]);
    });

    it('should preserve order', async () => {
      const items = [5, 3, 1, 4, 2];
      const filtered = await executor.filter(items, (x: number) => x > 2);
      expect(filtered).toEqual([5, 3, 4]);
    });

    it('should return empty array when none match', async () => {
      const items = [1, 1, 1];
      const filtered = await executor.filter(items, (x: number) => x % 2 === 0);
      expect(filtered).toEqual([]);
    });
  });

  describe('some', () => {
    it('should return true when some match', async () => {
      const items = [1, 2, 3, 4, 5];
      const hasEven = await executor.some(items, (x: number) => x % 2 === 0);
      expect(hasEven).toBe(true);
    });

    it('should return false when none match', async () => {
      const items = [1, 3, 5, 7, 9];
      const hasEven = await executor.some(items, (x: number) => x % 2 === 0);
      expect(hasEven).toBe(false);
    });

    it('should return false for empty array', async () => {
      const result = await executor.some([], (x: number) => x % 2 === 0);
      expect(result).toBe(false);
    });
  });

  describe('every', () => {
    it('should return true when all match', async () => {
      const items = [2, 4, 6, 8];
      const allEven = await executor.every(items, (x: number) => x % 2 === 0);
      expect(allEven).toBe(true);
    });

    it('should return false when some do not match', async () => {
      const items = [2, 4, 5, 8];
      const allEven = await executor.every(items, (x: number) => x % 2 === 0);
      expect(allEven).toBe(false);
    });

    it('should return true for empty array', async () => {
      const allEven = await executor.every([], (x: number) => x % 2 === 0);
      expect(allEven).toBe(true);
    });
  });

  describe('find', () => {
    it('should find first matching item', async () => {
      const items = [1, 3, 5, 6, 7, 8];
      const found = await executor.find(items, (x: number) => x % 2 === 0);
      expect(found).toBe(6);
    });

    it('should return undefined when not found', async () => {
      const items = [1, 3, 5, 7];
      const found = await executor.find(items, (x: number) => x % 2 === 0);
      expect(found).toBeUndefined();
    });

    it('should return undefined for empty array', async () => {
      const found = await executor.find([], (x: number) => x % 2 === 0);
      expect(found).toBeUndefined();
    });
  });

  describe('findIndex', () => {
    it('should find index of first matching item', async () => {
      const items = [1, 3, 5, 6, 7, 8];
      const index = await executor.findIndex(items, (x: number) => x % 2 === 0);
      expect(index).toBe(3);
    });

    it('should return -1 when not found', async () => {
      const items = [1, 3, 5, 7];
      const index = await executor.findIndex(items, (x: number) => x % 2 === 0);
      expect(index).toBe(-1);
    });

    it('should return -1 for empty array', async () => {
      const index = await executor.findIndex([], (x: number) => x % 2 === 0);
      expect(index).toBe(-1);
    });
  });

  describe('map', () => {
    it('should map items with a registered method', async () => {
      const items = [1, 2, 3, 4, 5];
      const result = await executor.map(items, 'double');
      expect(result.successes).toEqual([2, 4, 6, 8, 10]);
    });

    it('should handle empty array', async () => {
      const result = await executor.map([], 'double');
      expect(result.successes).toEqual([]);
    });
  });
});

describe('Parallel Processing with inline functions', () => {
  let executor: MainThreadExecutor;

  beforeEach(() => {
    executor = new MainThreadExecutor();
  });

  afterEach(async () => {
    await executor.terminate();
  });

  describe('execBatch', () => {
    it('should execute batch of tasks', async () => {
      executor.register({
        add: (a: number, b: number) => a + b,
        multiply: (a: number, b: number) => a * b,
      });

      const result = await executor.execBatch([
        { method: 'add', params: [1, 2] },
        { method: 'multiply', params: [3, 4] },
        { method: 'add', params: [5, 6] },
      ]);

      expect(result.successCount).toBe(3);
      expect(result.successes).toEqual([3, 12, 11]);
      expect(result.failureCount).toBe(0);
    });

    it('should handle partial failures', async () => {
      executor.register({
        succeed: (x: number) => x * 2,
        fail: () => {
          throw new Error('Task failed');
        },
      });

      const result = await executor.execBatch([
        { method: 'succeed', params: [5] },
        { method: 'fail', params: [] },
        { method: 'succeed', params: [10] },
      ]);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
    });
  });
});

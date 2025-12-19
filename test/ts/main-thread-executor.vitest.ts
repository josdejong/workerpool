/**
 * Tests for MainThreadExecutor (graceful degradation)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MainThreadExecutor,
  hasWorkerSupport,
  createPoolWithFallback,
  mainThreadExecutor,
} from '../../src/ts/core/main-thread-executor';

describe('MainThreadExecutor', () => {
  let executor: MainThreadExecutor;

  beforeEach(() => {
    executor = new MainThreadExecutor({
      methods: {
        add: (a: number, b: number) => a + b,
        multiply: (a: number, b: number) => a * b,
        asyncDouble: async (x: number) => {
          return x * 2;
        },
        throwError: () => {
          throw new Error('Test error');
        },
      },
    });
  });

  describe('exec', () => {
    it('should execute registered methods', async () => {
      const result = await executor.exec<number>('add', [2, 3]);
      expect(result).toBe(5);
    });

    it('should execute async methods', async () => {
      const result = await executor.exec<number>('asyncDouble', [21]);
      expect(result).toBe(42);
    });

    it('should handle errors', async () => {
      await expect(executor.exec('throwError')).rejects.toThrow('Test error');
    });

    it('should throw for unknown methods', async () => {
      await expect(executor.exec('unknown')).rejects.toThrow('Unknown method');
    });

    it('should execute dynamic functions', async () => {
      const result = await executor.exec('run', ['(x) => x * 2', [21]]);
      expect(result).toBe(42);
    });
  });

  describe('proxy', () => {
    it('should create a proxy object', async () => {
      const proxy = await executor.proxy<{
        add: (a: number, b: number) => number;
        multiply: (a: number, b: number) => number;
      }>();

      expect(proxy.add).toBeDefined();
      expect(proxy.multiply).toBeDefined();

      const sum = await proxy.add(2, 3);
      expect(sum).toBe(5);

      const product = await proxy.multiply(2, 3);
      expect(product).toBe(6);
    });
  });

  describe('batch operations', () => {
    it('should execute batch tasks', async () => {
      const result = await executor.execBatch([
        { method: 'add', params: [1, 2] },
        { method: 'multiply', params: [3, 4] },
      ]);

      expect(result.successCount).toBe(2);
      expect(result.successes).toEqual([3, 12]);
    });
  });

  describe('stats', () => {
    it('should return executor stats', () => {
      const stats = executor.stats();
      expect(stats.totalWorkers).toBe(1);
      expect(stats.idleWorkers).toBe(1);
      expect(stats.busyWorkers).toBe(0);
    });
  });

  describe('terminate', () => {
    it('should resolve immediately', async () => {
      const result = await executor.terminate();
      expect(result).toEqual([]);
    });
  });

  describe('events', () => {
    it('should emit task events', async () => {
      const taskStart = vi.fn();
      const taskComplete = vi.fn();

      executor.on('taskStart', taskStart);
      executor.on('taskComplete', taskComplete);

      await executor.exec('add', [1, 2]);

      expect(taskStart).toHaveBeenCalledOnce();
      expect(taskComplete).toHaveBeenCalledOnce();
    });
  });
});

describe('hasWorkerSupport', () => {
  it('should detect worker support', () => {
    // In Node.js test environment, workers should be supported
    expect(typeof hasWorkerSupport()).toBe('boolean');
  });
});

describe('mainThreadExecutor', () => {
  it('should create an executor', () => {
    const exec = mainThreadExecutor({ methods: { foo: () => 'bar' } });
    expect(exec).toBeInstanceOf(MainThreadExecutor);
  });
});

describe('createPoolWithFallback', () => {
  it('should create executor when pool factory fails', () => {
    const result = createPoolWithFallback(
      () => {
        throw new Error('Pool creation failed');
      },
      { methods: { test: () => 42 } }
    );

    expect(result).toBeInstanceOf(MainThreadExecutor);
  });
});

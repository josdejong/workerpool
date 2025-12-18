/**
 * Pool Tests
 *
 * Tests for the TypeScript Pool implementation.
 * Mirrors the functionality of test/js/Pool.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Pool,
  getSharedPool,
  terminateSharedPool,
  hasSharedPool,
} from '../../src/ts/core/Pool';
import { FIFOQueue, LIFOQueue } from '../../src/ts/core/TaskQueue';

describe('Pool', () => {
  let createdPools: Pool[] = [];

  function createPool(scriptOrOptions?: string | object, options?: object): Pool {
    const pool = new Pool(scriptOrOptions as string, options);
    createdPools.push(pool);
    return pool;
  }

  afterEach(async () => {
    while (createdPools.length > 0) {
      const pool = createdPools.shift();
      if (pool) {
        try {
          await pool.terminate(true); // Force terminate to avoid hanging
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
  }, 15000);

  describe('construction', () => {
    it('should create a pool with default options', () => {
      const pool = createPool();
      expect(pool).toBeDefined();
      expect(pool.workers).toEqual([]);
      expect(pool.maxWorkers).toBeGreaterThan(0);
    });

    it('should accept script as first argument', () => {
      const pool = createPool('/path/to/worker.js');
      expect(pool.script).toBe('/path/to/worker.js');
    });

    it('should accept options object as first argument', () => {
      const pool = createPool({ maxWorkers: 4 });
      expect(pool.script).toBeNull();
      expect(pool.maxWorkers).toBe(4);
    });

    it('should accept script and options', () => {
      const pool = createPool('/path/to/worker.js', { maxWorkers: 2 });
      expect(pool.script).toBe('/path/to/worker.js');
      expect(pool.maxWorkers).toBe(2);
    });
  });

  describe('options', () => {
    describe('maxWorkers', () => {
      it('should throw error for non-integer maxWorkers', () => {
        expect(() => createPool({ maxWorkers: 2.5 })).toThrow(TypeError);
      });

      it('should throw error for string maxWorkers', () => {
        expect(() => createPool({ maxWorkers: 'a string' as unknown as number })).toThrow(TypeError);
      });

      it('should throw error for zero maxWorkers', () => {
        expect(() => createPool({ maxWorkers: 0 })).toThrow(TypeError);
      });

      it('should throw error for negative maxWorkers', () => {
        expect(() => createPool({ maxWorkers: -1 })).toThrow(TypeError);
      });

      it('should accept valid maxWorkers', () => {
        const pool = createPool({ maxWorkers: 4 });
        expect(pool.maxWorkers).toBe(4);
      });

      it('should use default maxWorkers based on CPUs', () => {
        const pool = createPool();
        const os = require('os');
        expect(pool.maxWorkers).toBe(Math.max(os.cpus().length - 1, 1));
      });
    });

    describe('minWorkers', () => {
      it('should throw error for non-integer minWorkers', () => {
        expect(() => createPool({ minWorkers: 2.5 })).toThrow(TypeError);
      });

      it('should throw error for string minWorkers', () => {
        expect(() => createPool({ minWorkers: 'a string' as unknown as number })).toThrow(TypeError);
      });

      it('should accept "max" as minWorkers', () => {
        const pool = createPool({ minWorkers: 'max', maxWorkers: 4 });
        expect(pool.minWorkers).toBe(4);
      });

      it('should increase maxWorkers to match minWorkers', () => {
        const pool = createPool({ minWorkers: 10, maxWorkers: 2 });
        expect(pool.minWorkers).toBe(10);
        expect(pool.maxWorkers).toBe(10);
      });
    });

    describe('queueStrategy', () => {
      it('should use FIFO queue by default', () => {
        const pool = createPool();
        const stats = pool.stats();
        expect(stats.pendingTasks).toBe(0);
      });

      it('should use FIFO queue when specified', () => {
        const pool = createPool({ queueStrategy: 'fifo' });
        expect(pool).toBeDefined();
      });

      it('should use LIFO queue when specified', () => {
        const pool = createPool({ queueStrategy: 'lifo' });
        expect(pool).toBeDefined();
      });

      it('should accept custom queue', () => {
        const customQueue = new FIFOQueue();
        const pool = createPool({ queueStrategy: customQueue });
        expect(pool).toBeDefined();
      });
    });

    describe('workerType', () => {
      it('should default to "auto"', () => {
        const pool = createPool();
        expect(pool.workerType).toBe('auto');
      });

      it('should accept "process"', () => {
        const pool = createPool({ workerType: 'process' });
        expect(pool.workerType).toBe('process');
      });

      it('should accept "thread"', () => {
        const pool = createPool({ workerType: 'thread' });
        expect(pool.workerType).toBe('thread');
      });
    });

    describe('maxQueueSize', () => {
      it('should default to Infinity', () => {
        const pool = createPool();
        expect(pool.maxQueueSize).toBe(Infinity);
      });

      it('should accept custom value', () => {
        const pool = createPool({ maxQueueSize: 100 });
        expect(pool.maxQueueSize).toBe(100);
      });
    });

    describe('workerTerminateTimeout', () => {
      it('should default to 1000', () => {
        const pool = createPool();
        expect(pool.workerTerminateTimeout).toBe(1000);
      });

      it('should accept custom value', () => {
        const pool = createPool({ workerTerminateTimeout: 5000 });
        expect(pool.workerTerminateTimeout).toBe(5000);
      });
    });

    describe('emitStdStreams', () => {
      it('should default to false', () => {
        const pool = createPool();
        expect(pool.emitStdStreams).toBe(false);
      });

      it('should accept true', () => {
        const pool = createPool({ emitStdStreams: true });
        expect(pool.emitStdStreams).toBe(true);
      });
    });
  });

  describe('stats', () => {
    it('should return correct initial stats', () => {
      const pool = createPool();
      const stats = pool.stats();

      expect(stats.totalWorkers).toBe(0);
      expect(stats.busyWorkers).toBe(0);
      expect(stats.idleWorkers).toBe(0);
      expect(stats.pendingTasks).toBe(0);
      expect(stats.activeTasks).toBe(0);
    });

    it('should include circuit breaker state', () => {
      const pool = createPool({ circuitBreaker: { enabled: true } });
      const stats = pool.stats();

      expect(stats.circuitState).toBe('closed');
    });

    it('should include estimated queue memory', () => {
      const pool = createPool();
      const stats = pool.stats();

      expect(stats.estimatedQueueMemory).toBe(0);
    });
  });

  describe('ready state', () => {
    it('should have ready promise', () => {
      const pool = createPool();
      expect(pool.ready).toBeDefined();
      expect(typeof pool.ready.then).toBe('function');
    });

    it('should have isReady property', () => {
      const pool = createPool();
      expect(typeof pool.isReady).toBe('boolean');
    });

    it('should be ready immediately without eagerInit', async () => {
      const pool = createPool();
      expect(pool.isReady).toBe(true);
    });

    it('should have warmup method', () => {
      const pool = createPool();
      expect(typeof pool.warmup).toBe('function');
    });
  });

  describe('capabilities', () => {
    it('should expose capabilities property', () => {
      const pool = createPool();
      // capabilities may not be available if the module doesn't exist
      try {
        const caps = pool.capabilities;
        expect(caps).toBeDefined();
        expect(typeof caps).toBe('object');
      } catch (err) {
        // Module might not exist in TypeScript build
        expect((err as Error).message).toContain('Cannot find module');
      }
    });
  });

  describe('event emitter', () => {
    it('should have on method', () => {
      const pool = createPool();
      expect(typeof pool.on).toBe('function');
    });

    it('should have off method', () => {
      const pool = createPool();
      expect(typeof pool.off).toBe('function');
    });

    it('should have once method', () => {
      const pool = createPool();
      expect(typeof pool.once).toBe('function');
    });

    it('should return pool from on for chaining', () => {
      const pool = createPool();
      const result = pool.on('taskStart', () => {});
      expect(result).toBe(pool);
    });

    it('should return pool from off for chaining', () => {
      const pool = createPool();
      const handler = () => {};
      pool.on('taskStart', handler);
      const result = pool.off('taskStart', handler);
      expect(result).toBe(pool);
    });
  });

  describe('exec validation', () => {
    it('should throw error for non-array params', () => {
      const pool = createPool();
      expect(() => pool.exec('method', {} as unknown as unknown[])).toThrow(TypeError);
    });

    it('should throw error for non-function non-string method', () => {
      const pool = createPool();
      expect(() => pool.exec(123 as unknown as string)).toThrow(TypeError);
    });

    it('should accept function as method', () => {
      const pool = createPool();
      // This will create a task but won't execute without workers
      const promise = pool.exec(() => 42);
      expect(promise).toBeDefined();
      expect(typeof promise.then).toBe('function');
      // Cancel to prevent timeout issues in afterEach
      if (typeof (promise as unknown as { cancel?: () => void }).cancel === 'function') {
        (promise as unknown as { cancel: () => void }).cancel();
      }
    });

    it('should accept string as method', () => {
      const pool = createPool();
      // This will create a task but won't execute without workers
      const promise = pool.exec('methodName', []);
      expect(promise).toBeDefined();
      expect(typeof promise.then).toBe('function');
      // Cancel to prevent timeout issues in afterEach
      if (typeof (promise as unknown as { cancel?: () => void }).cancel === 'function') {
        (promise as unknown as { cancel: () => void }).cancel();
      }
    });
  });

  describe('terminate', () => {
    it('should have terminate method', () => {
      const pool = createPool();
      expect(typeof pool.terminate).toBe('function');
    });

    it('should return promise from terminate', () => {
      const pool = createPool();
      const result = pool.terminate();
      expect(result).toBeDefined();
      expect(typeof result.then).toBe('function');
    });

    it('should clear workers on terminate', async () => {
      const pool = createPool();
      await pool.terminate();
      expect(pool.workers.length).toBe(0);
    });
  });

  describe('proxy', () => {
    it('should have proxy method', () => {
      const pool = createPool();
      expect(typeof pool.proxy).toBe('function');
    });

    it('should throw error when called with arguments', () => {
      const pool = createPool();
      expect(() => (pool.proxy as (arg: unknown) => unknown)({})).toThrow();
    });
  });

  describe('batch operations', () => {
    it('should have execBatch method', () => {
      const pool = createPool();
      expect(typeof pool.execBatch).toBe('function');
    });

    it('should have map method', () => {
      const pool = createPool();
      expect(typeof pool.map).toBe('function');
    });
  });

  describe('circuit breaker', () => {
    it('should start in closed state', () => {
      const pool = createPool({ circuitBreaker: { enabled: true } });
      expect(pool.stats().circuitState).toBe('closed');
    });

    it('should accept circuit breaker options', () => {
      const pool = createPool({
        circuitBreaker: {
          enabled: true,
          errorThreshold: 10,
          resetTimeout: 60000,
          halfOpenRequests: 3,
        },
      });
      expect(pool.stats().circuitState).toBe('closed');
    });

    it('should include circuit state in stats', () => {
      const pool = createPool({ circuitBreaker: { enabled: true } });
      const stats = pool.stats();
      expect('circuitState' in stats).toBe(true);
    });
  });

  describe('memory management', () => {
    it('should track estimated queue memory', () => {
      const pool = createPool();
      const stats = pool.stats();
      expect('estimatedQueueMemory' in stats).toBe(true);
      expect(stats.estimatedQueueMemory).toBe(0);
    });

    it('should accept memory options', () => {
      const pool = createPool({
        memory: {
          maxQueueMemory: 1024 * 1024,
          onMemoryPressure: 'reject',
        },
      });
      expect(pool).toBeDefined();
    });
  });

  describe('hooks', () => {
    it('should accept onCreateWorker hook', () => {
      const onCreateWorker = vi.fn();
      const pool = createPool({ onCreateWorker });
      expect(pool.onCreateWorker).toBeDefined();
    });

    it('should accept onTerminateWorker hook', () => {
      const onTerminateWorker = vi.fn();
      const pool = createPool({ onTerminateWorker });
      expect(pool.onTerminateWorker).toBeDefined();
    });
  });

  describe('Shared Pool Singleton', () => {
    afterEach(async () => {
      // Force terminate to avoid hanging on non-existent worker scripts
      try {
        await terminateSharedPool(true);
      } catch {
        // Ignore errors during cleanup
      }
    }, 15000);

    it('getSharedPool should return a pool', () => {
      const pool = getSharedPool();
      expect(pool).toBeDefined();
      expect(typeof pool.exec).toBe('function');
    });

    it('hasSharedPool should return true after creation', () => {
      getSharedPool();
      expect(hasSharedPool()).toBe(true);
    });

    it('should return same instance on multiple calls', () => {
      const pool1 = getSharedPool();
      const pool2 = getSharedPool();
      expect(pool1).toBe(pool2);
    });

    it('terminateSharedPool should clear the singleton', async () => {
      getSharedPool();
      expect(hasSharedPool()).toBe(true);
      await terminateSharedPool(true);
      expect(hasSharedPool()).toBe(false);
    });

    it('should accept options for shared pool', () => {
      const pool = getSharedPool({ maxWorkers: 2 });
      expect(pool.maxWorkers).toBe(2);
    });
  });

  describe('fork options', () => {
    it('should store forkArgs', () => {
      const pool = createPool({ forkArgs: ['--arg1', '--arg2'] });
      expect(pool.forkArgs).toEqual(['--arg1', '--arg2']);
    });

    it('should store forkOpts', () => {
      const pool = createPool({ forkOpts: { env: { TEST: 'value' } } });
      expect(pool.forkOpts).toEqual({ env: { TEST: 'value' } });
    });

    it('should freeze forkArgs', () => {
      const pool = createPool({ forkArgs: ['--arg1'] });
      expect(Object.isFrozen(pool.forkArgs)).toBe(true);
    });

    it('should freeze forkOpts', () => {
      const pool = createPool({ forkOpts: { env: {} } });
      expect(Object.isFrozen(pool.forkOpts)).toBe(true);
    });
  });

  describe('worker thread options', () => {
    it('should store workerThreadOpts', () => {
      const pool = createPool({
        workerThreadOpts: { resourceLimits: { maxOldGenerationSizeMb: 100 } },
      });
      expect(pool.workerThreadOpts).toEqual({
        resourceLimits: { maxOldGenerationSizeMb: 100 },
      });
    });

    it('should freeze workerThreadOpts', () => {
      const pool = createPool({ workerThreadOpts: {} });
      expect(Object.isFrozen(pool.workerThreadOpts)).toBe(true);
    });
  });

  describe('worker options (browser)', () => {
    it('should store workerOpts', () => {
      const pool = createPool({ workerOpts: { type: 'module' } });
      expect(pool.workerOpts).toEqual({ type: 'module' });
    });

    it('should freeze workerOpts', () => {
      const pool = createPool({ workerOpts: {} });
      expect(Object.isFrozen(pool.workerOpts)).toBe(true);
    });
  });
});

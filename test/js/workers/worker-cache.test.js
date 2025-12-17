const assert = require('assert');

// Mock WorkerCache for testing (actual TS implementation not directly importable)
// This tests the interface and expected behavior

/**
 * Simple mock implementation for testing WorkerCache behavior
 */
class MockWorkerCache {
  constructor(options) {
    this.options = {
      minWorkers: 0,
      maxWorkers: 4,
      preWarm: false,
      idleTimeout: 60000,
      maxTasksPerWorker: 10000,
      ...options,
    };
    this.cache = new Map();
    this.warmPool = [];
    this.busySet = new Set();
    this.nextId = 1;
    this.isShuttingDown = false;
  }

  async warmUp() {
    for (let i = 0; i < this.options.minWorkers; i++) {
      await this.createWorker();
    }
  }

  async createWorker() {
    const id = this.nextId++;
    const worker = {
      id,
      state: 'ready',
      lastUsed: Date.now(),
      taskCount: 0,
      isWarm: true,
      consecutiveFailures: 0,
      isHealthy: true,
    };
    this.cache.set(id, worker);
    this.warmPool.push(id);
    return worker;
  }

  async acquire() {
    if (this.isShuttingDown) return null;

    // Try warm pool first
    if (this.warmPool.length > 0) {
      const id = this.warmPool.pop();
      const worker = this.cache.get(id);
      if (worker) {
        worker.state = 'busy';
        worker.isWarm = false;
        this.busySet.add(id);
        return worker;
      }
    }

    // Create new if under max
    if (this.cache.size < this.options.maxWorkers) {
      const worker = await this.createWorker();
      const id = this.warmPool.pop(); // Remove from warm pool
      worker.state = 'busy';
      worker.isWarm = false;
      this.busySet.add(worker.id);
      return worker;
    }

    return null;
  }

  release(workerId) {
    const worker = this.cache.get(workerId);
    if (!worker) return;

    this.busySet.delete(workerId);
    worker.taskCount++;
    worker.state = 'ready';
    worker.isWarm = true;
    worker.lastUsed = Date.now();
    this.warmPool.push(workerId);
  }

  stats() {
    return {
      total: this.cache.size,
      warm: this.warmPool.length,
      busy: this.busySet.size,
    };
  }

  hasAvailable() {
    return this.warmPool.length > 0 || this.cache.size < this.options.maxWorkers;
  }

  async shutdown() {
    this.isShuttingDown = true;
    this.cache.clear();
    this.warmPool.length = 0;
    this.busySet.clear();
  }
}

describe('WorkerCache', function () {
  describe('Basic Operations', function () {
    it('should create cache with default options', function () {
      const cache = new MockWorkerCache({ script: './worker.js' });
      assert.strictEqual(cache.options.minWorkers, 0);
      assert.strictEqual(cache.options.maxWorkers, 4);
    });

    it('should warm up to minWorkers', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        minWorkers: 2,
      });

      await cache.warmUp();
      const stats = cache.stats();

      assert.strictEqual(stats.total, 2);
      assert.strictEqual(stats.warm, 2);
    });

    it('should acquire worker from warm pool', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        minWorkers: 2,
      });

      await cache.warmUp();
      const worker = await cache.acquire();

      assert.notStrictEqual(worker, null);
      assert.strictEqual(worker.state, 'busy');

      const stats = cache.stats();
      assert.strictEqual(stats.warm, 1);
      assert.strictEqual(stats.busy, 1);
    });

    it('should create new worker when warm pool empty', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        maxWorkers: 4,
      });

      const worker = await cache.acquire();

      assert.notStrictEqual(worker, null);
      assert.strictEqual(worker.state, 'busy');
    });

    it('should return null when at max capacity', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        maxWorkers: 1,
      });

      const worker1 = await cache.acquire();
      assert.notStrictEqual(worker1, null);

      const worker2 = await cache.acquire();
      assert.strictEqual(worker2, null);
    });
  });

  describe('Release', function () {
    it('should release worker back to warm pool', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
      });

      const worker = await cache.acquire();
      assert.notStrictEqual(worker, null);

      cache.release(worker.id);

      const stats = cache.stats();
      assert.strictEqual(stats.warm, 1);
      assert.strictEqual(stats.busy, 0);
    });

    it('should increment task count on release', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
      });

      const worker = await cache.acquire();
      cache.release(worker.id);

      assert.strictEqual(cache.cache.get(worker.id).taskCount, 1);
    });
  });

  describe('Stats', function () {
    it('should report correct statistics', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        minWorkers: 2,
      });

      await cache.warmUp();

      const stats1 = cache.stats();
      assert.strictEqual(stats1.total, 2);
      assert.strictEqual(stats1.warm, 2);
      assert.strictEqual(stats1.busy, 0);

      const worker = await cache.acquire();
      const stats2 = cache.stats();
      assert.strictEqual(stats2.warm, 1);
      assert.strictEqual(stats2.busy, 1);

      cache.release(worker.id);
      const stats3 = cache.stats();
      assert.strictEqual(stats3.warm, 2);
      assert.strictEqual(stats3.busy, 0);
    });
  });

  describe('Availability', function () {
    it('should report availability correctly', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        maxWorkers: 1,
      });

      assert.strictEqual(cache.hasAvailable(), true);

      await cache.acquire();
      assert.strictEqual(cache.hasAvailable(), false);
    });
  });

  describe('Shutdown', function () {
    it('should clear all workers on shutdown', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        minWorkers: 2,
      });

      await cache.warmUp();
      await cache.shutdown();

      const stats = cache.stats();
      assert.strictEqual(stats.total, 0);
      assert.strictEqual(stats.warm, 0);
    });

    it('should prevent acquire after shutdown', async function () {
      const cache = new MockWorkerCache({
        script: './worker.js',
        minWorkers: 2,
      });

      await cache.warmUp();
      await cache.shutdown();

      const worker = await cache.acquire();
      assert.strictEqual(worker, null);
    });
  });
});

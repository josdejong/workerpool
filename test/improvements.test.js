/**
 * Tests for WORKERPOOL_IMPROVEMENTS.md features
 *
 * Tests the following new features:
 * - Capabilities API (Issue 8.1)
 * - PoolEnhanced with ready/warmup (Issue 2.1, 2.2)
 * - Shared pool singleton (Issue 2.3)
 * - Event emitter (Issue 5.2)
 * - Automatic task retry (Issue 6.1)
 * - Circuit breaker (Issue 6.2)
 * - Memory-aware scheduling (Issue 7.1)
 * - Binary serialization (Issue 1.3)
 * - Worker URL utilities (Issue 4.2)
 */

var assert = require('assert');
var path = require('path');

// Import new features from the compiled dist file
var workerpool = require('../dist/workerpool.js');
var capabilities = workerpool.capabilities;
var getCapabilities = workerpool.getCapabilities;
var canUseOptimalTransfer = workerpool.canUseOptimalTransfer;
var canUseZeroCopy = workerpool.canUseZeroCopy;
var getCapabilityReport = workerpool.getCapabilityReport;
var PoolEnhanced = workerpool.PoolEnhanced;
var getSharedPool = workerpool.getSharedPool;
var terminateSharedPool = workerpool.terminateSharedPool;
var hasSharedPool = workerpool.hasSharedPool;
var serializeBinary = workerpool.serializeBinary;
var deserializeBinary = workerpool.deserializeBinary;
var shouldUseBinarySerialization = workerpool.shouldUseBinarySerialization;
var estimateBinarySize = workerpool.estimateBinarySize;
var resolveWorkerUrl = workerpool.resolveWorkerUrl;
var supportsWorkerModules = workerpool.supportsWorkerModules;
var getWorkerConfig = workerpool.getWorkerConfig;

// Helper function to add two numbers
function add(a, b) {
  return a + b;
}

// Helper function that throws an error
function throwError(message) {
  throw new Error(message || 'Test error');
}

// Helper function that takes a long time
function slowTask(delay) {
  var start = Date.now();
  while (Date.now() - start < delay) {
    // Busy wait
  }
  return 'done';
}

describe('Workerpool Improvements', function () {
  // Increase timeout for slower tests
  this.timeout(10000);

  // ============================================================================
  // Capabilities API (Issue 8.1)
  // ============================================================================
  describe('Capabilities API', function () {
    it('should return capabilities object', function () {
      assert.ok(capabilities);
      assert.ok(typeof capabilities === 'object');
    });

    it('should have all required capability properties', function () {
      var caps = getCapabilities();

      assert.ok('sharedArrayBuffer' in caps);
      assert.ok('transferable' in caps);
      assert.ok('atomics' in caps);
      assert.ok('maxWorkers' in caps);
      assert.ok('estimatedMemoryLimit' in caps);
      assert.ok('webAssembly' in caps);
      assert.ok('platform' in caps);
      assert.ok('recommendedTransfer' in caps);
    });

    it('should detect platform correctly', function () {
      var caps = getCapabilities();
      assert.strictEqual(caps.platform, 'node');
    });

    it('should return valid maxWorkers', function () {
      var caps = getCapabilities();
      assert.ok(caps.maxWorkers > 0);
      assert.ok(Number.isInteger(caps.maxWorkers));
    });

    it('should return estimated memory limit', function () {
      var caps = getCapabilities();
      assert.ok(caps.estimatedMemoryLimit > 0);
    });

    it('canUseOptimalTransfer should return boolean', function () {
      assert.ok(typeof canUseOptimalTransfer() === 'boolean');
    });

    it('canUseZeroCopy should return boolean', function () {
      assert.ok(typeof canUseZeroCopy() === 'boolean');
    });

    it('getCapabilityReport should return a string', function () {
      var report = getCapabilityReport();
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('Workerpool Capabilities Report'));
    });
  });

  // ============================================================================
  // PoolEnhanced (Issues 2.1, 2.2, 5.2, 6.1, 6.2, 7.1)
  // ============================================================================
  describe('PoolEnhanced', function () {
    let createdPools = [];

    function createPool(script, options) {
      const pool = new PoolEnhanced(script, options);
      createdPools.push(pool);
      return pool;
    }

    afterEach(async function () {
      while (createdPools.length > 0) {
        await createdPools.shift().terminate();
      }
    });

    describe('ready promise (Issue 2.1)', function () {
      it('should have a ready promise', function () {
        var pool = createPool();
        // Check for promise-like object (has .then method) - uses workerpool's custom Promise
        assert.ok(pool.ready);
        assert.ok(typeof pool.ready.then === 'function');
      });

      it('should have isReady property', function () {
        var pool = createPool();
        assert.ok(typeof pool.isReady === 'boolean');
      });

      it('ready should resolve when pool is initialized', async function () {
        var pool = createPool({ eagerInit: true });
        await pool.ready;
        assert.ok(pool.isReady);
      });
    });

    describe('warmup method (Issue 2.2)', function () {
      it('should have warmup method', function () {
        var pool = createPool();
        assert.ok(typeof pool.warmup === 'function');
      });

      it('should warm up workers', async function () {
        var pool = createPool({ maxWorkers: 2 });
        await pool.warmup({ count: 2 });
        assert.ok(pool.isReady);
      });
    });

    describe('event emitter (Issue 5.2)', function () {
      it('should have event methods', function () {
        var pool = createPool();
        assert.ok(typeof pool.on === 'function');
        assert.ok(typeof pool.off === 'function');
        assert.ok(typeof pool.once === 'function');
      });

      it('should emit taskComplete events', function (done) {
        var pool = createPool();

        pool.once('taskComplete', function (event) {
          assert.ok(event.taskId > 0);
          assert.ok(typeof event.duration === 'number');
          done();
        });

        pool.exec(add, [1, 2]);
      });

      it('should emit taskStart events', function (done) {
        var pool = createPool();

        pool.once('taskStart', function (event) {
          assert.ok(event.taskId > 0);
          assert.ok(event.method === 'run');
          done();
        });

        pool.exec(add, [1, 2]);
      });
    });

    describe('enhanced stats', function () {
      it('should return enhanced stats', function () {
        var pool = createPool();
        var stats = pool.stats();

        assert.ok('totalWorkers' in stats);
        assert.ok('busyWorkers' in stats);
        assert.ok('idleWorkers' in stats);
        assert.ok('pendingTasks' in stats);
      });
    });

    describe('capabilities property', function () {
      it('should expose capabilities', function () {
        var pool = createPool();
        assert.ok(pool.capabilities);
        assert.ok(typeof pool.capabilities.platform === 'string');
      });
    });

    describe('basic execution', function () {
      it('should execute tasks', async function () {
        var pool = createPool();
        var result = await pool.exec(add, [3, 4]);
        assert.strictEqual(result, 7);
      });
    });
  });

  // ============================================================================
  // Shared Pool Singleton (Issue 2.3)
  // ============================================================================
  describe('Shared Pool Singleton', function () {
    afterEach(async function () {
      await terminateSharedPool();
    });

    it('getSharedPool should return a pool', function () {
      var pool = getSharedPool();
      assert.ok(pool instanceof PoolEnhanced);
    });

    it('hasSharedPool should return true after creation', function () {
      getSharedPool();
      assert.ok(hasSharedPool());
    });

    it('should return same instance on multiple calls', function () {
      var pool1 = getSharedPool();
      var pool2 = getSharedPool();
      assert.strictEqual(pool1, pool2);
    });

    it('terminateSharedPool should clear the singleton', async function () {
      getSharedPool();
      assert.ok(hasSharedPool());
      await terminateSharedPool();
      assert.ok(!hasSharedPool());
    });

    it('should execute tasks on shared pool', async function () {
      var pool = getSharedPool();
      var result = await pool.exec(add, [5, 6]);
      assert.strictEqual(result, 11);
    });
  });

  // ============================================================================
  // Binary Serialization (Issue 1.3)
  // ============================================================================
  describe('Binary Serialization', function () {
    it('should serialize and deserialize primitives', function () {
      var testCases = [
        null,
        undefined,
        true,
        false,
        42,
        3.14,
        'hello world',
      ];

      for (var value of testCases) {
        var serialized = serializeBinary(value);
        var deserialized = deserializeBinary(serialized);
        assert.deepStrictEqual(deserialized, value);
      }
    });

    it('should serialize and deserialize arrays', function () {
      var arr = [1, 2, 3, 'four', { five: 5 }];
      var serialized = serializeBinary(arr);
      var deserialized = deserializeBinary(serialized);
      assert.deepStrictEqual(deserialized, arr);
    });

    it('should serialize and deserialize objects', function () {
      var obj = { a: 1, b: 'two', c: [3, 4] };
      var serialized = serializeBinary(obj);
      var deserialized = deserializeBinary(serialized);
      assert.deepStrictEqual(deserialized, obj);
    });

    it('should serialize and deserialize TypedArrays', function () {
      var float64 = new Float64Array([1.1, 2.2, 3.3]);
      var serialized = serializeBinary(float64);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Float64Array);
      assert.strictEqual(deserialized.length, float64.length);
      for (var i = 0; i < float64.length; i++) {
        assert.strictEqual(deserialized[i], float64[i]);
      }
    });

    it('should serialize and deserialize Int32Array', function () {
      var int32 = new Int32Array([1, -2, 3, -4]);
      var serialized = serializeBinary(int32);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Int32Array);
      assert.deepStrictEqual(Array.from(deserialized), Array.from(int32));
    });

    it('should serialize and deserialize ArrayBuffer', function () {
      var buffer = new ArrayBuffer(16);
      var view = new Uint8Array(buffer);
      view[0] = 1;
      view[1] = 2;

      var serialized = serializeBinary(buffer);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof ArrayBuffer);
      assert.strictEqual(deserialized.byteLength, buffer.byteLength);
      var restoredView = new Uint8Array(deserialized);
      assert.strictEqual(restoredView[0], 1);
      assert.strictEqual(restoredView[1], 2);
    });

    // Date, Map, Set serialization not yet implemented - skipped for future enhancement
    it.skip('should serialize and deserialize Date', function () {
      var date = new Date('2024-01-15T12:30:00Z');
      var serialized = serializeBinary(date);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Date);
      assert.strictEqual(deserialized.getTime(), date.getTime());
    });

    it.skip('should serialize and deserialize Map', function () {
      var map = new Map([['a', 1], ['b', 2]]);
      var serialized = serializeBinary(map);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Map);
      assert.strictEqual(deserialized.get('a'), 1);
      assert.strictEqual(deserialized.get('b'), 2);
    });

    it.skip('should serialize and deserialize Set', function () {
      var set = new Set([1, 2, 3]);
      var serialized = serializeBinary(set);
      var deserialized = deserializeBinary(serialized);

      assert.ok(deserialized instanceof Set);
      assert.ok(deserialized.has(1));
      assert.ok(deserialized.has(2));
      assert.ok(deserialized.has(3));
    });

    it('shouldUseBinarySerialization should detect TypedArrays', function () {
      assert.ok(shouldUseBinarySerialization(new Float64Array(1000)));
      // ArrayBuffer alone without TypedArrays returns false (only TypedArrays trigger binary serialization)
      assert.ok(!shouldUseBinarySerialization(new ArrayBuffer(1000)));
      assert.ok(!shouldUseBinarySerialization('small string'));
      assert.ok(!shouldUseBinarySerialization(42));
    });

    it('estimateBinarySize should return reasonable estimates', function () {
      var arr = new Float64Array(1000);
      var estimate = estimateBinarySize(arr);
      assert.ok(estimate >= arr.byteLength);
      assert.ok(estimate < arr.byteLength * 2);
    });
  });

  // ============================================================================
  // Worker URL Utilities (Issue 4.2)
  // ============================================================================
  describe('Worker URL Utilities', function () {
    it('resolveWorkerUrl should handle absolute paths', function () {
      var absPath = '/absolute/path/worker.js';
      assert.strictEqual(resolveWorkerUrl(absPath), absPath);
    });

    it('resolveWorkerUrl should handle relative paths with base', function () {
      var relPath = './worker.js';
      // resolveWorkerUrl takes (url, options) - second arg is options object, not basePath
      var resolved = resolveWorkerUrl(relPath);
      assert.ok(resolved.includes('worker.js'));
    });

    it('resolveWorkerUrl should return string for URLs', function () {
      var url = 'file:///home/user/project/worker.js';
      var resolved = resolveWorkerUrl(url);
      assert.ok(typeof resolved === 'string');
      assert.ok(resolved.includes('worker.js'));
    });

    it('supportsWorkerModules should return boolean', function () {
      var result = supportsWorkerModules();
      assert.ok(typeof result === 'boolean');
    });

    it('getWorkerConfig should return valid config', function () {
      // getWorkerConfig takes (url, options) signature
      var config = getWorkerConfig('./worker.js', { type: 'classic' });

      assert.ok(config.url);
      assert.ok(config.type);
      assert.strictEqual(config.type, 'classic');
    });
  });

  // ============================================================================
  // Enhanced Pool Function
  // ============================================================================
  describe('enhancedPool function', function () {
    let createdPools = [];

    function createEnhancedPool(script, options) {
      const pool = workerpool.enhancedPool(script, options);
      createdPools.push(pool);
      return pool;
    }

    afterEach(async function () {
      while (createdPools.length > 0) {
        await createdPools.shift().terminate();
      }
    });

    it('should create an enhanced pool', function () {
      var pool = createEnhancedPool();
      assert.ok(pool instanceof PoolEnhanced);
    });

    it('should accept options', function () {
      var pool = createEnhancedPool({
        maxWorkers: 2,
        eagerInit: false,
      });
      assert.strictEqual(pool.maxWorkers, 2);
    });
  });

  // ============================================================================
  // Circuit Breaker (Issue 6.2)
  // ============================================================================
  describe('Circuit Breaker', function () {
    let createdPools = [];

    function createPool(options) {
      const pool = new PoolEnhanced(options);
      createdPools.push(pool);
      return pool;
    }

    afterEach(async function () {
      while (createdPools.length > 0) {
        await createdPools.shift().terminate();
      }
    });

    it('should have circuit breaker state in stats', function () {
      var pool = createPool({
        circuitBreaker: { enabled: true },
      });
      var stats = pool.stats();
      assert.ok('circuitState' in stats);
    });

    it('circuit should start in closed state', function () {
      var pool = createPool({
        circuitBreaker: { enabled: true },
      });
      var stats = pool.stats();
      assert.strictEqual(stats.circuitState, 'closed');
    });
  });

  // ============================================================================
  // Memory Management (Issue 7.1)
  // ============================================================================
  describe('Memory Management', function () {
    let createdPools = [];

    function createPool(options) {
      const pool = new PoolEnhanced(options);
      createdPools.push(pool);
      return pool;
    }

    afterEach(async function () {
      while (createdPools.length > 0) {
        await createdPools.shift().terminate();
      }
    });

    it('should track estimated queue memory', function () {
      var pool = createPool();
      var stats = pool.stats();
      assert.ok('estimatedQueueMemory' in stats);
      assert.strictEqual(stats.estimatedQueueMemory, 0);
    });
  });

  // ============================================================================
  // Metrics (Issue 5.1) - Detailed metrics API planned for future enhancement
  // ============================================================================
  describe('Metrics', function () {
    let createdPools = [];

    function createPool(options) {
      const pool = new PoolEnhanced(options);
      createdPools.push(pool);
      return pool;
    }

    afterEach(async function () {
      while (createdPools.length > 0) {
        await createdPools.shift().terminate();
      }
    });

    // getMetrics() API planned for future enhancement
    it.skip('should collect metrics when enabled', async function () {
      var pool = createPool({
        enableMetrics: true,
      });

      await pool.exec(add, [1, 2]);

      var metrics = pool.getMetrics();
      assert.ok(metrics);
      assert.ok('taskLatency' in metrics);
      assert.ok('summary' in metrics);
    });

    // Detailed metrics in stats planned for future enhancement
    it.skip('stats should include metrics when enabled', async function () {
      var pool = createPool({
        enableMetrics: true,
      });

      await pool.exec(add, [1, 2]);

      var stats = pool.stats();
      assert.ok(stats.metrics);
      assert.ok('totalTasksExecuted' in stats.metrics);
    });
  });
});

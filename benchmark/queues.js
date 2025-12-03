/**
 * Queue Implementation Benchmarks
 *
 * Compares performance of different queue implementations:
 * - JavaScript FIFO (Array-based)
 * - JavaScript LIFO (Array-based)
 * - JavaScript Priority (Binary Heap)
 * - WASM Ring Buffer (when available)
 *
 * Run with: node benchmark/queues.js
 */

const path = require('path');
const fs = require('fs');

// Import queue implementations from JavaScript source
const { FIFOQueue, LIFOQueue } = require('../src/queues');

// Simple PriorityQueue implementation (matches TypeScript version)
function PriorityQueue(comparator) {
  this._heap = [];
  this._comparator = comparator || function (a, b) {
    var priorityA = (a.options && a.options.metadata && a.options.metadata.priority) || 0;
    var priorityB = (b.options && b.options.metadata && b.options.metadata.priority) || 0;
    return priorityB - priorityA;
  };
}

PriorityQueue.prototype.push = function (task) {
  this._heap.push(task);
  this._siftUp(this._heap.length - 1);
};

PriorityQueue.prototype.pop = function () {
  if (this._heap.length === 0) return undefined;
  var result = this._heap[0];
  var last = this._heap.pop();
  if (this._heap.length > 0 && last !== undefined) {
    this._heap[0] = last;
    this._siftDown(0);
  }
  return result;
};

PriorityQueue.prototype.size = function () {
  return this._heap.length;
};

PriorityQueue.prototype.contains = function (task) {
  return this._heap.includes(task);
};

PriorityQueue.prototype.clear = function () {
  this._heap.length = 0;
};

PriorityQueue.prototype._siftUp = function (index) {
  while (index > 0) {
    var parentIndex = Math.floor((index - 1) / 2);
    if (this._comparator(this._heap[index], this._heap[parentIndex]) < 0) {
      var temp = this._heap[index];
      this._heap[index] = this._heap[parentIndex];
      this._heap[parentIndex] = temp;
      index = parentIndex;
    } else break;
  }
};

PriorityQueue.prototype._siftDown = function (index) {
  var length = this._heap.length;
  while (true) {
    var leftIndex = 2 * index + 1;
    var rightIndex = 2 * index + 2;
    var smallest = index;
    if (leftIndex < length && this._comparator(this._heap[leftIndex], this._heap[smallest]) < 0) smallest = leftIndex;
    if (rightIndex < length && this._comparator(this._heap[rightIndex], this._heap[smallest]) < 0) smallest = rightIndex;
    if (smallest !== index) {
      var temp = this._heap[index];
      this._heap[index] = this._heap[smallest];
      this._heap[smallest] = temp;
      index = smallest;
    } else break;
  }
};

// Benchmark configuration
const WARMUP_ITERATIONS = 1000;
const BENCHMARK_ITERATIONS = 100000;
const PRIORITY_LEVELS = 10;

/**
 * Create a mock task for benchmarking
 */
function createMockTask(id, priority = 0) {
  return {
    method: 'test',
    params: [id],
    resolver: {
      promise: Promise.resolve(),
      resolve: () => {},
      reject: () => {},
    },
    timeout: null,
    options: {
      metadata: { priority },
    },
  };
}

/**
 * Measure execution time of a function
 */
function measureTime(fn, iterations) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn(i);
  }
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // Convert to milliseconds
}

/**
 * Run benchmark for a queue implementation
 */
function benchmarkQueue(name, createQueue) {
  console.log(`\n=== ${name} ===`);

  // Create queue
  const queue = createQueue();

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    queue.push(createMockTask(i, i % PRIORITY_LEVELS));
  }
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    queue.pop();
  }

  // Benchmark push
  const pushTime = measureTime((i) => {
    queue.push(createMockTask(i, i % PRIORITY_LEVELS));
  }, BENCHMARK_ITERATIONS);

  console.log(`Push: ${pushTime.toFixed(2)}ms for ${BENCHMARK_ITERATIONS} ops`);
  console.log(`  ${(BENCHMARK_ITERATIONS / pushTime * 1000).toFixed(0)} ops/sec`);
  console.log(`  ${(pushTime / BENCHMARK_ITERATIONS * 1000).toFixed(3)}μs per op`);

  // Benchmark pop
  const popTime = measureTime(() => {
    queue.pop();
  }, BENCHMARK_ITERATIONS);

  console.log(`Pop: ${popTime.toFixed(2)}ms for ${BENCHMARK_ITERATIONS} ops`);
  console.log(`  ${(BENCHMARK_ITERATIONS / popTime * 1000).toFixed(0)} ops/sec`);
  console.log(`  ${(popTime / BENCHMARK_ITERATIONS * 1000).toFixed(3)}μs per op`);

  // Benchmark mixed operations (50% push, 50% pop)
  // First fill queue halfway
  for (let i = 0; i < BENCHMARK_ITERATIONS / 2; i++) {
    queue.push(createMockTask(i, i % PRIORITY_LEVELS));
  }

  const mixedTime = measureTime((i) => {
    if (i % 2 === 0) {
      queue.push(createMockTask(i, i % PRIORITY_LEVELS));
    } else {
      queue.pop();
    }
  }, BENCHMARK_ITERATIONS);

  console.log(`Mixed (50/50): ${mixedTime.toFixed(2)}ms for ${BENCHMARK_ITERATIONS} ops`);
  console.log(`  ${(BENCHMARK_ITERATIONS / mixedTime * 1000).toFixed(0)} ops/sec`);

  return {
    name,
    pushTime,
    popTime,
    mixedTime,
    pushOpsPerSec: BENCHMARK_ITERATIONS / pushTime * 1000,
    popOpsPerSec: BENCHMARK_ITERATIONS / popTime * 1000,
    mixedOpsPerSec: BENCHMARK_ITERATIONS / mixedTime * 1000,
  };
}

/**
 * Benchmark Array.shift() baseline (old implementation)
 */
function benchmarkArrayShift() {
  console.log(`\n=== Array.shift() Baseline ===`);

  const array = [];

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    array.push(createMockTask(i));
  }
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    array.shift();
  }

  // Benchmark push
  const pushTime = measureTime((i) => {
    array.push(createMockTask(i));
  }, BENCHMARK_ITERATIONS);

  console.log(`Push: ${pushTime.toFixed(2)}ms for ${BENCHMARK_ITERATIONS} ops`);
  console.log(`  ${(BENCHMARK_ITERATIONS / pushTime * 1000).toFixed(0)} ops/sec`);

  // Benchmark shift (O(n) operation)
  const shiftTime = measureTime(() => {
    array.shift();
  }, BENCHMARK_ITERATIONS);

  console.log(`Shift: ${shiftTime.toFixed(2)}ms for ${BENCHMARK_ITERATIONS} ops`);
  console.log(`  ${(BENCHMARK_ITERATIONS / shiftTime * 1000).toFixed(0)} ops/sec`);
  console.log(`  ${(shiftTime / BENCHMARK_ITERATIONS * 1000).toFixed(3)}μs per op`);

  return {
    name: 'Array.shift()',
    pushTime,
    popTime: shiftTime,
    pushOpsPerSec: BENCHMARK_ITERATIONS / pushTime * 1000,
    popOpsPerSec: BENCHMARK_ITERATIONS / shiftTime * 1000,
  };
}

/**
 * Print comparison summary
 */
function printSummary(results) {
  console.log('\n========================================');
  console.log('BENCHMARK SUMMARY');
  console.log('========================================');
  console.log(`Operations: ${BENCHMARK_ITERATIONS.toLocaleString()}`);
  console.log('');

  // Sort by pop ops/sec (most important metric for task scheduling)
  const sorted = [...results].sort((a, b) => b.popOpsPerSec - a.popOpsPerSec);

  console.log('Pop Performance (ops/sec, higher is better):');
  sorted.forEach((r, i) => {
    const baseline = sorted[sorted.length - 1].popOpsPerSec;
    const speedup = r.popOpsPerSec / baseline;
    console.log(`  ${i + 1}. ${r.name}: ${r.popOpsPerSec.toFixed(0)} ops/sec (${speedup.toFixed(1)}x baseline)`);
  });

  console.log('');
  console.log('Push Performance (ops/sec):');
  sorted.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name}: ${r.pushOpsPerSec.toFixed(0)} ops/sec`);
  });
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('Queue Implementation Benchmarks');
  console.log('================================');
  console.log(`Iterations: ${BENCHMARK_ITERATIONS.toLocaleString()}`);
  console.log(`Warmup: ${WARMUP_ITERATIONS.toLocaleString()}`);

  const results = [];

  // Benchmark Array.shift() baseline
  results.push(benchmarkArrayShift());

  // Benchmark FIFO Queue
  results.push(benchmarkQueue('FIFOQueue (Circular Buffer)', () => new FIFOQueue(1024)));

  // Benchmark LIFO Queue
  results.push(benchmarkQueue('LIFOQueue (Array Stack)', () => new LIFOQueue()));

  // Benchmark Priority Queue
  results.push(benchmarkQueue('PriorityQueue (Binary Heap)', () => new PriorityQueue()));

  // Print summary
  printSummary(results);

  // Check if WASM is available
  const wasmPath = path.join(__dirname, '..', 'dist', 'workerpool.wasm');
  if (fs.existsSync(wasmPath)) {
    console.log('\n[Note: WASM file exists. WASM queue benchmarks require SharedArrayBuffer support.]');
  } else {
    console.log('\n[Note: WASM file not found. Build with "npm run build:wasm" to enable WASM benchmarks.]');
  }
}

// Run benchmarks
main().catch(console.error);

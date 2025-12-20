#!/usr/bin/env node
/**
 * Benchmark: JavaScript vs TypeScript + WASM builds
 *
 * Compares performance between:
 * - JavaScript build (src/js/)
 * - TypeScript + WASM build (dist/ts/full.js)
 * - Advanced Pool with worker choice strategies
 * - Work stealing and task affinity features
 */

import { performance } from 'perf_hooks';

// Import both builds
const workerpoolJS = await import('./src/js/index.js');
const workerpoolTS = await import('./dist/ts/full.js');

const ITERATIONS = 1000;
const WARMUP = 100;

/**
 * Simple CPU-bound task for benchmarking
 */
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Variable duration task to test load balancing
 */
function variableWork(complexity) {
  let result = 0;
  for (let i = 0; i < complexity * 1000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

/**
 * Run a benchmark and return average time in ms
 */
async function benchmark(name, fn, iterations = ITERATIONS) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await fn();
  }

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const stdDev = Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length);

  return { name, avg, min, max, stdDev, iterations };
}

/**
 * Print benchmark results
 */
function printResults(results) {
  console.log(`\n  ${results.name}`);
  console.log(`    Avg: ${results.avg.toFixed(3)} ms`);
  console.log(`    Min: ${results.min.toFixed(3)} ms`);
  console.log(`    Max: ${results.max.toFixed(3)} ms`);
  console.log(`    StdDev: ${results.stdDev.toFixed(3)} ms`);
  console.log(`    Iterations: ${results.iterations}`);
}

/**
 * Compare two benchmark results
 */
function compareResults(jsResult, tsResult) {
  const speedup = jsResult.avg / tsResult.avg;
  const faster = speedup > 1 ? 'TS+WASM' : 'JS';
  const ratio = speedup > 1 ? speedup : 1 / speedup;

  console.log(`\n  Comparison:`);
  console.log(`    ${faster} is ${ratio.toFixed(2)}x faster`);
  console.log(`    JS avg: ${jsResult.avg.toFixed(3)} ms`);
  console.log(`    TS+WASM avg: ${tsResult.avg.toFixed(3)} ms`);
}

/**
 * Compare multiple strategy results
 */
function compareStrategies(results) {
  const sorted = [...results].sort((a, b) => a.avg - b.avg);
  const fastest = sorted[0];

  console.log(`\n  Strategy Comparison (fastest first):`);
  for (const r of sorted) {
    const ratio = r.avg / fastest.avg;
    const ratioStr = ratio === 1 ? '(baseline)' : `(${ratio.toFixed(2)}x slower)`;
    console.log(`    ${r.name.padEnd(30)} ${r.avg.toFixed(3)} ms ${ratioStr}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  Workerpool Benchmark: JS vs TS+WASM vs Advanced Pool');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`\n  Warmup: ${WARMUP} iterations`);
  console.log(`  Benchmark: ${ITERATIONS} iterations`);

  // ============================================================
  // Benchmark 1: Pool Creation
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  1. Pool Creation');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsPoolCreate = await benchmark('JS Pool Creation', async () => {
    const pool = workerpoolJS.pool({ maxWorkers: 2 });
    await pool.terminate();
  }, 50);
  printResults(jsPoolCreate);

  const tsPoolCreate = await benchmark('TS+WASM Pool Creation', async () => {
    const pool = workerpoolTS.pool({ maxWorkers: 2 });
    await pool.terminate();
  }, 50);
  printResults(tsPoolCreate);

  const advPoolCreate = await benchmark('AdvancedPool Creation', async () => {
    const pool = workerpoolTS.advancedPool({
      maxWorkers: 2,
      workerChoiceStrategy: 'least-busy',
      enableWorkStealing: true,
    });
    await pool.terminate();
  }, 50);
  printResults(advPoolCreate);

  compareResults(jsPoolCreate, tsPoolCreate);

  // ============================================================
  // Benchmark 2: Task Execution (offload function)
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  2. Task Execution (offload fibonacci(20))');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsPool = workerpoolJS.pool({ maxWorkers: 4 });
  const tsPool = workerpoolTS.pool({ maxWorkers: 4 });
  const advPool = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-busy',
    enableWorkStealing: true,
  });

  const jsExec = await benchmark('JS Task Execution', async () => {
    await jsPool.exec(fibonacci, [20]);
  }, 200);
  printResults(jsExec);

  const tsExec = await benchmark('TS+WASM Task Execution', async () => {
    await tsPool.exec(fibonacci, [20]);
  }, 200);
  printResults(tsExec);

  const advExec = await benchmark('AdvancedPool Task Execution', async () => {
    await advPool.exec(fibonacci, [20]);
  }, 200);
  printResults(advExec);

  compareResults(jsExec, tsExec);

  // ============================================================
  // Benchmark 3: Concurrent Task Throughput
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  3. Concurrent Task Throughput (50 tasks per iteration)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsConcurrent = await benchmark('JS Concurrent Tasks', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(jsPool.exec(fibonacci, [15]));
    }
    await Promise.all(promises);
  }, 20);
  printResults(jsConcurrent);

  const tsConcurrent = await benchmark('TS+WASM Concurrent Tasks', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(tsPool.exec(fibonacci, [15]));
    }
    await Promise.all(promises);
  }, 20);
  printResults(tsConcurrent);

  const advConcurrent = await benchmark('AdvancedPool Concurrent Tasks', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(advPool.exec(fibonacci, [15]));
    }
    await Promise.all(promises);
  }, 20);
  printResults(advConcurrent);

  compareResults(jsConcurrent, tsConcurrent);

  // ============================================================
  // Benchmark 4: High-Volume Queue Operations
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  4. High-Volume Queue (100 quick tasks per iteration)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsQueue = await benchmark('JS Queue Throughput', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(jsPool.exec((x) => x * 2, [i]));
    }
    await Promise.all(promises);
  }, 10);
  printResults(jsQueue);

  const tsQueue = await benchmark('TS+WASM Queue Throughput', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(tsPool.exec((x) => x * 2, [i]));
    }
    await Promise.all(promises);
  }, 10);
  printResults(tsQueue);

  const advQueue = await benchmark('AdvancedPool Queue Throughput', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(advPool.exec((x) => x * 2, [i]));
    }
    await Promise.all(promises);
  }, 10);
  printResults(advQueue);

  compareResults(jsQueue, tsQueue);

  // Cleanup first set of pools
  await jsPool.terminate();
  await tsPool.terminate();
  await advPool.terminate();

  // ============================================================
  // Benchmark 5: Worker Choice Strategy Comparison
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  5. Worker Choice Strategy Comparison (variable workload)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const strategies = [
    'round-robin',
    'least-busy',
    'least-used',
    'fair-share',
  ];

  const strategyResults = [];

  for (const strategy of strategies) {
    const pool = workerpoolTS.advancedPool({
      maxWorkers: 4,
      workerChoiceStrategy: strategy,
      enableWorkStealing: false, // Disable to isolate strategy impact
    });

    const result = await benchmark(`Strategy: ${strategy}`, async () => {
      const promises = [];
      // Submit tasks with varying complexity to test load balancing
      for (let i = 0; i < 20; i++) {
        const complexity = (i % 5) + 1; // 1-5 complexity levels
        promises.push(pool.exec(variableWork, [complexity]));
      }
      await Promise.all(promises);
    }, 15);

    printResults(result);
    strategyResults.push(result);
    await pool.terminate();
  }

  compareStrategies(strategyResults);

  // ============================================================
  // Benchmark 6: Work Stealing Impact
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  6. Work Stealing Impact (imbalanced workload)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const poolNoStealing = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: false,
  });

  const poolWithStealing = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: true,
    stealingPolicy: 'busiest-first',
  });

  const noStealResult = await benchmark('Without Work Stealing', async () => {
    const promises = [];
    // Create imbalanced workload - some tasks are 10x heavier
    for (let i = 0; i < 20; i++) {
      const complexity = i < 5 ? 10 : 1; // First 5 tasks are heavy
      promises.push(poolNoStealing.exec(variableWork, [complexity]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(noStealResult);

  const stealResult = await benchmark('With Work Stealing', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      const complexity = i < 5 ? 10 : 1;
      promises.push(poolWithStealing.exec(variableWork, [complexity]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(stealResult);

  const stealSpeedup = noStealResult.avg / stealResult.avg;
  console.log(`\n  Work Stealing Impact: ${stealSpeedup.toFixed(2)}x ${stealSpeedup > 1 ? 'faster' : 'slower'}`);

  await poolNoStealing.terminate();
  await poolWithStealing.terminate();

  // ============================================================
  // Benchmark 7: Task Affinity Performance
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  7. Task Affinity Performance (related tasks)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const poolNoAffinity = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: false,
  });

  const poolWithAffinity = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: true,
  });

  const noAffinityResult = await benchmark('Without Task Affinity', async () => {
    const promises = [];
    // Simulate user requests that should ideally go to same worker
    for (let userId = 0; userId < 5; userId++) {
      for (let req = 0; req < 4; req++) {
        promises.push(poolNoAffinity.exec(fibonacci, [15]));
      }
    }
    await Promise.all(promises);
  }, 15);
  printResults(noAffinityResult);

  const affinityResult = await benchmark('With Task Affinity', async () => {
    const promises = [];
    for (let userId = 0; userId < 5; userId++) {
      for (let req = 0; req < 4; req++) {
        // Use affinity key to route same user's requests to same worker
        promises.push(poolWithAffinity.execWithAffinity(`user-${userId}`, fibonacci, [15]));
      }
    }
    await Promise.all(promises);
  }, 15);
  printResults(affinityResult);

  const affinitySpeedup = noAffinityResult.avg / affinityResult.avg;
  console.log(`\n  Task Affinity Impact: ${affinitySpeedup.toFixed(2)}x ${affinitySpeedup > 1 ? 'faster' : 'slower'}`);

  await poolNoAffinity.terminate();
  await poolWithAffinity.terminate();

  // ============================================================
  // Benchmark 8: Optimized Pool Factory Functions
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  8. Optimized Pool Factory Functions');
  console.log('───────────────────────────────────────────────────────────────────────');

  const cpuPool = workerpoolTS.cpuIntensivePool({ maxWorkers: 4 });
  const ioPool = workerpoolTS.ioIntensivePool({ maxWorkers: 4 });
  const mixedPool = workerpoolTS.mixedWorkloadPool({ maxWorkers: 4 });

  const cpuResult = await benchmark('cpuIntensivePool', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(cpuPool.exec(fibonacci, [18]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(cpuResult);

  const ioResult = await benchmark('ioIntensivePool', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(ioPool.exec(fibonacci, [18]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(ioResult);

  const mixedResult = await benchmark('mixedWorkloadPool', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(mixedPool.exec(fibonacci, [18]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(mixedResult);

  compareStrategies([cpuResult, ioResult, mixedResult]);

  await cpuPool.terminate();
  await ioPool.terminate();
  await mixedPool.terminate();

  // ============================================================
  // Benchmark 9: Data Structures Performance
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  9. Internal Data Structures Performance');
  console.log('───────────────────────────────────────────────────────────────────────');

  // Test CircularBuffer performance
  const circularBufferResult = await benchmark('GrowableCircularBuffer (10k ops)', () => {
    const buffer = new workerpoolTS.GrowableCircularBuffer(16);
    for (let i = 0; i < 5000; i++) {
      buffer.push(i);
    }
    for (let i = 0; i < 5000; i++) {
      buffer.shift();
    }
    return buffer;
  }, 500);
  printResults(circularBufferResult);

  // Test WorkStealingDeque performance
  const dequeResult = await benchmark('WorkStealingDeque (10k ops)', () => {
    const deque = new workerpoolTS.WorkStealingDeque(0, 16);
    for (let i = 0; i < 5000; i++) {
      deque.pushBottom({ id: i, data: i, timestamp: Date.now() });
    }
    for (let i = 0; i < 2500; i++) {
      deque.popBottom(); // LIFO
    }
    for (let i = 0; i < 2500; i++) {
      deque.steal(); // FIFO
    }
    return deque;
  }, 500);
  printResults(dequeResult);

  // Test WorkerChoiceStrategy performance
  const strategyManagerResult = await benchmark('WorkerChoiceStrategyManager (10k selections)', () => {
    const manager = new workerpoolTS.WorkerChoiceStrategyManager('least-busy');
    // Mock workers
    const mockWorkers = Array(4).fill(null).map((_, i) => ({ busy: () => i % 2 === 0 }));

    for (let i = 0; i < 4; i++) {
      manager.initializeWorker(i);
    }

    for (let i = 0; i < 10000; i++) {
      manager.choose(mockWorkers);
      if (i % 100 === 0) {
        manager.updateStats(i % 4, Math.random() * 100, true);
      }
    }
    return manager;
  }, 100);
  printResults(strategyManagerResult);

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const results = [
    { name: 'Pool Creation', js: jsPoolCreate.avg, ts: tsPoolCreate.avg, adv: advPoolCreate.avg },
    { name: 'Task Execution', js: jsExec.avg, ts: tsExec.avg, adv: advExec.avg },
    { name: 'Concurrent Tasks', js: jsConcurrent.avg, ts: tsConcurrent.avg, adv: advConcurrent.avg },
    { name: 'Queue Throughput', js: jsQueue.avg, ts: tsQueue.avg, adv: advQueue.avg },
  ];

  console.log('\n  Benchmark              JS (ms)    TS+WASM (ms)   AdvPool (ms)   Winner');
  console.log('  ─────────────────────────────────────────────────────────────────────');

  let jsWins = 0, tsWins = 0, advWins = 0;

  for (const r of results) {
    const minVal = Math.min(r.js, r.ts, r.adv);
    let winner;
    if (minVal === r.js) { winner = 'JS'; jsWins++; }
    else if (minVal === r.ts) { winner = 'TS+WASM'; tsWins++; }
    else { winner = 'AdvPool'; advWins++; }

    const jsStr = r.js.toFixed(3).padStart(10);
    const tsStr = r.ts.toFixed(3).padStart(12);
    const advStr = r.adv.toFixed(3).padStart(12);
    console.log(`  ${r.name.padEnd(20)} ${jsStr}   ${tsStr}   ${advStr}   ${winner}`);
  }

  console.log('\n  ─────────────────────────────────────────────────────────────────────');
  console.log(`  Wins: JS=${jsWins}, TS+WASM=${tsWins}, AdvancedPool=${advWins}`);

  console.log('\n  Advanced Features Summary:');
  console.log(`    Work Stealing Impact: ${stealSpeedup.toFixed(2)}x`);
  console.log(`    Task Affinity Impact: ${affinitySpeedup.toFixed(2)}x`);
  console.log(`    Best Strategy: ${strategyResults.sort((a, b) => a.avg - b.avg)[0].name}`);

  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

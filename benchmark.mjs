#!/usr/bin/env node
/**
 * Benchmark: JavaScript vs TypeScript + WASM builds
 *
 * Compares performance between:
 * - JavaScript build (src/js/)
 * - TypeScript + WASM build (dist/ts/full.js)
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

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Workerpool Benchmark: JavaScript vs TypeScript + WASM');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\n  Warmup: ${WARMUP} iterations`);
  console.log(`  Benchmark: ${ITERATIONS} iterations`);

  // ============================================================
  // Benchmark 1: Pool Creation
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  1. Pool Creation');
  console.log('───────────────────────────────────────────────────────────');

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

  compareResults(jsPoolCreate, tsPoolCreate);

  // ============================================================
  // Benchmark 2: Task Execution (offload function)
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  2. Task Execution (offload fibonacci(20))');
  console.log('───────────────────────────────────────────────────────────');

  const jsPool = workerpoolJS.pool({ maxWorkers: 4 });
  const tsPool = workerpoolTS.pool({ maxWorkers: 4 });

  const jsExec = await benchmark('JS Task Execution', async () => {
    await jsPool.exec(fibonacci, [20]);
  }, 200);
  printResults(jsExec);

  const tsExec = await benchmark('TS+WASM Task Execution', async () => {
    await tsPool.exec(fibonacci, [20]);
  }, 200);
  printResults(tsExec);

  compareResults(jsExec, tsExec);

  // ============================================================
  // Benchmark 3: Concurrent Task Throughput
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  3. Concurrent Task Throughput (50 tasks per iteration)');
  console.log('───────────────────────────────────────────────────────────');

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

  compareResults(jsConcurrent, tsConcurrent);

  // ============================================================
  // Benchmark 4: High-Volume Queue Operations
  // ============================================================
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  4. High-Volume Queue (100 quick tasks per iteration)');
  console.log('───────────────────────────────────────────────────────────');

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

  compareResults(jsQueue, tsQueue);

  // Cleanup
  await jsPool.terminate();
  await tsPool.terminate();

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════');

  const results = [
    { name: 'Pool Creation', js: jsPoolCreate.avg, ts: tsPoolCreate.avg },
    { name: 'Task Execution', js: jsExec.avg, ts: tsExec.avg },
    { name: 'Concurrent Tasks', js: jsConcurrent.avg, ts: tsConcurrent.avg },
    { name: 'Queue Throughput', js: jsQueue.avg, ts: tsQueue.avg },
  ];

  console.log('\n  Benchmark              JS (ms)    TS+WASM (ms)   Winner');
  console.log('  ─────────────────────────────────────────────────────────');

  for (const r of results) {
    const winner = r.js < r.ts ? 'JS' : 'TS+WASM';
    const jsStr = r.js.toFixed(3).padStart(10);
    const tsStr = r.ts.toFixed(3).padStart(12);
    console.log(`  ${r.name.padEnd(20)} ${jsStr}   ${tsStr}   ${winner}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

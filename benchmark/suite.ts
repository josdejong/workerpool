/**
 * Performance Benchmark Suite
 *
 * Comprehensive benchmarks for workerpool v11.0.0
 *
 * Run with: npx tsx benchmark/suite.ts
 */

import workerpool from '../src/index.js';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Run a single benchmark
 */
async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const totalMs = times.reduce((a, b) => a + b, 0);

  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    opsPerSec: (iterations / totalMs) * 1000,
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    p99Ms: percentile(times, 99),
  };
}

/**
 * Format benchmark result for display
 */
function formatResult(result: BenchmarkResult): string {
  return [
    `  ${result.name}:`,
    `    Avg: ${result.avgMs.toFixed(3)}ms`,
    `    Ops/sec: ${result.opsPerSec.toFixed(1)}`,
    `    P50: ${result.p50Ms.toFixed(3)}ms`,
    `    P95: ${result.p95Ms.toFixed(3)}ms`,
    `    P99: ${result.p99Ms.toFixed(3)}ms`,
  ].join('\n');
}

/**
 * Run all benchmarks
 */
async function runSuite(): Promise<void> {
  console.log('workerpool v11.0.0 Benchmark Suite');
  console.log('==================================\n');

  const pool = workerpool.pool({
    maxWorkers: 4,
    workerType: 'thread',
  });

  const suites: BenchmarkSuite[] = [];

  // Suite 1: Basic Task Execution
  console.log('Running: Basic Task Execution...');
  const basicResults: BenchmarkResult[] = [];

  basicResults.push(
    await runBenchmark('Single task execution', async () => {
      await pool.exec((a: number, b: number) => a + b, [1, 2]);
    }, 1000)
  );

  basicResults.push(
    await runBenchmark('Multiple concurrent tasks (10)', async () => {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          pool.exec((n: number) => n * 2, [i])
        )
      );
    }, 100)
  );

  suites.push({ name: 'Basic Task Execution', results: basicResults });

  // Suite 2: Batch Operations
  console.log('Running: Batch Operations...');
  const batchResults: BenchmarkResult[] = [];

  batchResults.push(
    await runBenchmark('execBatch (100 tasks)', async () => {
      const tasks = Array.from({ length: 100 }, (_, i) => ({
        method: (n: number) => n * 2,
        params: [i],
      }));
      await pool.execBatch(tasks);
    }, 50)
  );

  batchResults.push(
    await runBenchmark('map (100 items)', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      await pool.map(items, (n: number) => n * 2);
    }, 50)
  );

  suites.push({ name: 'Batch Operations', results: batchResults });

  // Suite 3: Queue Operations
  console.log('Running: Queue Operations...');
  const queueResults: BenchmarkResult[] = [];

  // Create many tasks to stress queue
  queueResults.push(
    await runBenchmark('Queue 1000 tasks', async () => {
      const tasks = Array.from({ length: 1000 }, (_, i) =>
        pool.exec((n: number) => n, [i])
      );
      await Promise.all(tasks);
    }, 10)
  );

  suites.push({ name: 'Queue Operations', results: queueResults });

  // Suite 4: Data Transfer
  console.log('Running: Data Transfer...');
  const transferResults: BenchmarkResult[] = [];

  // Small data
  transferResults.push(
    await runBenchmark('Transfer 1KB data', async () => {
      const data = new Uint8Array(1024);
      await pool.exec((d: Uint8Array) => d.length, [data]);
    }, 100)
  );

  // Medium data
  transferResults.push(
    await runBenchmark('Transfer 100KB data', async () => {
      const data = new Uint8Array(100 * 1024);
      await pool.exec((d: Uint8Array) => d.length, [data]);
    }, 50)
  );

  // Large data
  transferResults.push(
    await runBenchmark('Transfer 1MB data', async () => {
      const data = new Uint8Array(1024 * 1024);
      await pool.exec((d: Uint8Array) => d.length, [data]);
    }, 20)
  );

  suites.push({ name: 'Data Transfer', results: transferResults });

  // Cleanup
  await pool.terminate();

  // Print results
  console.log('\n\nResults\n=======\n');

  for (const suite of suites) {
    console.log(`${suite.name}`);
    console.log('-'.repeat(suite.name.length));
    for (const result of suite.results) {
      console.log(formatResult(result));
    }
    console.log();
  }

  // Summary
  console.log('Summary');
  console.log('-------');
  for (const suite of suites) {
    for (const result of suite.results) {
      console.log(`  ${result.name}: ${result.opsPerSec.toFixed(1)} ops/sec`);
    }
  }
}

// Run if executed directly
runSuite().catch(console.error);

export { runBenchmark, runSuite, BenchmarkResult, BenchmarkSuite };

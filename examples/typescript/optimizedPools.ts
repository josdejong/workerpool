/**
 * Optimized Pool Factories Example (TypeScript)
 *
 * Demonstrates specialized pool factory functions:
 * - cpuIntensivePool: Optimized for CPU-bound tasks
 * - ioIntensivePool: Optimized for I/O-bound tasks
 * - mixedWorkloadPool: Balanced for mixed workloads
 *
 * Each factory pre-configures worker choice strategies
 * and settings for specific use cases.
 *
 * Run with: npx tsx examples/typescript/optimizedPools.ts
 */

import {
  advancedPool,
  cpuIntensivePool,
  ioIntensivePool,
  mixedWorkloadPool,
  type AdvancedPool,
} from '../../dist/ts/full.js';

/**
 * CPU-intensive task: prime number calculation
 */
function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function findPrimes(start: number, end: number): number[] {
  const primes: number[] = [];
  for (let n = start; n <= end; n++) {
    if (isPrime(n)) primes.push(n);
  }
  return primes;
}

interface IOResult {
  duration: number;
  timestamp: number;
}

/**
 * I/O-like task: simulated async operation
 */
function simulateIO(duration: number): Promise<IOResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ duration, timestamp: Date.now() });
    }, duration);
  });
}

interface MixedResult {
  input: string;
  computed: number;
  timestamp: number;
}

/**
 * Mixed task: some CPU work + some waiting
 */
function mixedTask(data: string): MixedResult {
  let result = 0;
  for (let i = 0; i < 100000; i++) {
    result += Math.sqrt(i);
  }

  return {
    input: data,
    computed: result,
    timestamp: Date.now(),
  };
}

async function main(): Promise<void> {
  console.log('Optimized Pool Factories Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: cpuIntensivePool
  // ============================================================
  console.log('\n1. cpuIntensivePool\n');

  console.log('  Configuration:');
  console.log('    - Worker count: cpus - 1 (leaves 1 core free)');
  console.log('    - Strategy: least-busy (balance compute load)');
  console.log('    - Work stealing: enabled');
  console.log('');

  const cpuPool: AdvancedPool = cpuIntensivePool({ maxWorkers: 4 });

  const start = Date.now();
  const ranges: [number, number][] = [
    [1, 10000],
    [10001, 20000],
    [20001, 30000],
    [30001, 40000],
  ];

  const primeResults: number[][] = await Promise.all(
    ranges.map(([s, e]) => cpuPool.exec(findPrimes, [s, e]))
  );

  const totalPrimes = primeResults.reduce((sum, arr) => sum + arr.length, 0);
  console.log(`  Found ${totalPrimes} primes in ${Date.now() - start}ms`);
  console.log('  Primes per range:', primeResults.map(r => r.length).join(', '));

  await cpuPool.terminate();

  // ============================================================
  // Example 2: ioIntensivePool
  // ============================================================
  console.log('\n2. ioIntensivePool\n');

  console.log('  Configuration:');
  console.log('    - Worker count: 2 * cpus (more workers for waiting)');
  console.log('    - Strategy: round-robin (quick distribution)');
  console.log('    - Optimized for many concurrent I/O operations');
  console.log('');

  const ioPool: AdvancedPool = ioIntensivePool({ maxWorkers: 8 });

  const ioStart = Date.now();
  const ioTasks: Promise<IOResult>[] = [];

  for (let i = 0; i < 20; i++) {
    const duration = 50 + Math.random() * 100;
    ioTasks.push(ioPool.exec(simulateIO, [duration]));
  }

  const ioResults = await Promise.all(ioTasks);
  console.log(`  Completed 20 I/O tasks in ${Date.now() - ioStart}ms`);
  console.log('  (With sequential execution, would take ~2000ms)');

  await ioPool.terminate();

  // ============================================================
  // Example 3: mixedWorkloadPool
  // ============================================================
  console.log('\n3. mixedWorkloadPool\n');

  console.log('  Configuration:');
  console.log('    - Worker count: cpus (balanced)');
  console.log('    - Strategy: fair-share (balance by execution time)');
  console.log('    - Good for varied task types');
  console.log('');

  const mixedPool: AdvancedPool = mixedWorkloadPool({ maxWorkers: 4 });

  const mixedStart = Date.now();
  const mixedTasks: Promise<MixedResult>[] = [];

  for (let i = 0; i < 10; i++) {
    mixedTasks.push(mixedPool.exec(mixedTask, [`data-${i}`]));
  }

  const mixedResults = await Promise.all(mixedTasks);
  console.log(`  Completed 10 mixed tasks in ${Date.now() - mixedStart}ms`);
  console.log('  Results:', mixedResults.length, 'completed');

  await mixedPool.terminate();

  // ============================================================
  // Example 4: Comparison
  // ============================================================
  console.log('\n4. Performance comparison\n');

  const cpuBound = (n: number): number => {
    let result = 0;
    for (let i = 0; i < n; i++) {
      result += Math.sqrt(i) * Math.log(i + 1);
    }
    return result;
  };

  interface PoolType {
    name: string;
    factory: (options: { maxWorkers: number }) => AdvancedPool;
  }

  const poolTypes: PoolType[] = [
    { name: 'cpuIntensivePool', factory: cpuIntensivePool },
    { name: 'ioIntensivePool', factory: ioIntensivePool },
    { name: 'mixedWorkloadPool', factory: mixedWorkloadPool },
  ];

  for (const { name, factory } of poolTypes) {
    const pool = factory({ maxWorkers: 4 });

    const compStart = Date.now();
    const tasks: Promise<number>[] = [];
    for (let i = 0; i < 16; i++) {
      tasks.push(pool.exec(cpuBound, [100000]));
    }
    await Promise.all(tasks);
    const elapsed = Date.now() - compStart;

    console.log(`  ${name.padEnd(20)} ${elapsed}ms (16 CPU tasks)`);

    await pool.terminate();
  }

  // ============================================================
  // Example 5: When to use each
  // ============================================================
  console.log('\n5. When to use each pool type\n');

  console.log('  cpuIntensivePool:');
  console.log('    - Image/video processing');
  console.log('    - Mathematical computations');
  console.log('    - Compression/encryption');
  console.log('    - Machine learning inference');
  console.log('');

  console.log('  ioIntensivePool:');
  console.log('    - File system operations');
  console.log('    - Network requests');
  console.log('    - Database queries');
  console.log('    - External API calls');
  console.log('');

  console.log('  mixedWorkloadPool:');
  console.log('    - Web servers (varied requests)');
  console.log('    - Data pipelines');
  console.log('    - General-purpose task runners');
  console.log('    - Unknown/varied workloads');

  // ============================================================
  // Example 6: Custom configuration
  // ============================================================
  console.log('\n6. Custom configuration\n');

  const customCpuPool: AdvancedPool = cpuIntensivePool({
    maxWorkers: 2,
    minWorkers: 1,
    workerTerminateTimeout: 5000,
  });

  console.log('  Created custom CPU pool with 2 workers');

  const customResult = await customCpuPool.exec(findPrimes, [1, 1000]);
  console.log('  Found', customResult.length, 'primes from 1-1000');

  await customCpuPool.terminate();

  // ============================================================
  // Example 7: advancedPool for full control
  // ============================================================
  console.log('\n7. advancedPool for full control\n');

  const advPool: AdvancedPool = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-used',
    enableWorkStealing: true,
    stealingPolicy: 'random',
    enableTaskAffinity: true,
  });

  console.log('  Created advanced pool with custom settings');

  const userId = 'user-123';
  const affinityResults: MixedResult[] = [];

  for (let i = 0; i < 5; i++) {
    const result = await advPool.execWithAffinity(userId, mixedTask, [`${userId}-op-${i}`]);
    affinityResults.push(result);
  }

  console.log('  Executed 5 tasks with affinity, all on same worker');

  await advPool.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Optimized Pool Factories examples completed!');
}

main().catch(console.error);

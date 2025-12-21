/**
 * Advanced Pool Example (TypeScript)
 *
 * Demonstrates the AdvancedPool with worker choice strategies:
 * - round-robin: Distribute tasks evenly across workers
 * - least-busy: Send to worker with fewest active tasks
 * - least-used: Send to worker with fewest total tasks executed
 * - fair-share: Balance based on cumulative execution time
 * - weighted-round-robin: Round-robin with worker weights
 *
 * Run with: npx tsx examples/typescript/advancedPool.ts
 */

import {
  advancedPool,
  cpuIntensivePool,
  ioIntensivePool,
  mixedWorkloadPool,
  type AdvancedPoolOptions,
  type WorkerChoiceStrategy,
} from '../../dist/ts/full.js';

/**
 * CPU-intensive task for demonstration
 */
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Variable duration task to test load balancing
 */
function variableWork(complexity: number): number {
  let result = 0;
  for (let i = 0; i < complexity * 1000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

async function main(): Promise<void> {
  console.log('Advanced Pool Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic AdvancedPool with least-busy strategy
  // ============================================================
  console.log('\n1. AdvancedPool with least-busy strategy\n');

  const pool1 = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-busy',
  });

  // Execute multiple tasks - they'll be distributed to least busy workers
  const tasks1: Promise<number>[] = [];
  for (let i = 0; i < 10; i++) {
    tasks1.push(pool1.exec(fibonacci, [20 + (i % 5)]));
  }

  const results1 = await Promise.all(tasks1);
  console.log('  Results:', results1.slice(0, 5).join(', '), '...');

  // Get pool stats
  const stats1 = pool1.stats();
  console.log('  Total workers:', stats1.totalWorkers);

  await pool1.terminate();

  // ============================================================
  // Example 2: Comparing different strategies
  // ============================================================
  console.log('\n2. Comparing worker choice strategies\n');

  const strategies: WorkerChoiceStrategy[] = [
    'round-robin',
    'least-busy',
    'least-used',
    'fair-share',
  ];

  for (const strategy of strategies) {
    const pool = advancedPool({
      maxWorkers: 4,
      workerChoiceStrategy: strategy,
    });

    const start = Date.now();
    const tasks: Promise<number>[] = [];

    // Submit tasks with varying complexity
    for (let i = 0; i < 20; i++) {
      const complexity = 15 + (i % 10); // 15-24
      tasks.push(pool.exec(fibonacci, [complexity]));
    }

    await Promise.all(tasks);
    const elapsed = Date.now() - start;

    console.log(`  ${strategy.padEnd(20)} completed in ${elapsed}ms`);

    await pool.terminate();
  }

  // ============================================================
  // Example 3: Work stealing enabled
  // ============================================================
  console.log('\n3. AdvancedPool with work stealing\n');

  const pool3 = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: true,
    stealingPolicy: 'busiest-first',
  });

  // Create an imbalanced workload
  const tasks3: Promise<number>[] = [];
  for (let i = 0; i < 20; i++) {
    const complexity = i < 5 ? 28 : 15;
    tasks3.push(pool3.exec(fibonacci, [complexity]));
  }

  const start3 = Date.now();
  await Promise.all(tasks3);
  console.log(`  Completed imbalanced workload in ${Date.now() - start3}ms`);

  await pool3.terminate();

  // ============================================================
  // Example 4: Factory functions for specific workloads
  // ============================================================
  console.log('\n4. Specialized pool factories\n');

  const cpuPool = cpuIntensivePool({ maxWorkers: 4 });
  console.log('  cpuIntensivePool: Uses least-busy strategy');

  const ioPool = ioIntensivePool({ maxWorkers: 8 });
  console.log('  ioIntensivePool: Uses round-robin, more workers');

  const mixedPool = mixedWorkloadPool({ maxWorkers: 4 });
  console.log('  mixedWorkloadPool: Uses fair-share strategy');

  const result = await cpuPool.exec(fibonacci, [25]);
  console.log(`\n  fibonacci(25) = ${result}`);

  await Promise.all([
    cpuPool.terminate(),
    ioPool.terminate(),
    mixedPool.terminate(),
  ]);

  // ============================================================
  // Example 5: Changing strategy at runtime
  // ============================================================
  console.log('\n5. Dynamic strategy switching\n');

  const pool5 = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
  });

  console.log('  Starting with round-robin strategy');
  await pool5.exec(fibonacci, [20]);

  pool5.setWorkerChoiceStrategy('least-busy');
  console.log('  Switched to least-busy strategy');
  await pool5.exec(fibonacci, [25]);

  pool5.setWorkerChoiceStrategy('fair-share');
  console.log('  Switched to fair-share strategy');
  await pool5.exec(fibonacci, [20]);

  await pool5.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Advanced Pool examples completed!');
}

main().catch(console.error);

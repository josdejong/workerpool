/**
 * Advanced Pool Example
 *
 * Demonstrates the AdvancedPool with worker choice strategies:
 * - round-robin: Distribute tasks evenly across workers
 * - least-busy: Send to worker with fewest active tasks
 * - least-used: Send to worker with fewest total tasks executed
 * - fair-share: Balance based on cumulative execution time
 * - weighted-round-robin: Round-robin with worker weights
 *
 * Run with: node examples/advancedPool.js
 */

const path = require('path');

// Import from the TypeScript build
const workerpool = require('../dist/ts/index.js');

/**
 * CPU-intensive task for demonstration
 */
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

async function main() {
  console.log('Advanced Pool Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic AdvancedPool with least-busy strategy
  // ============================================================
  console.log('\n1. AdvancedPool with least-busy strategy\n');

  const pool1 = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-busy',
  });

  // Execute multiple tasks - they'll be distributed to least busy workers
  const tasks1 = [];
  for (let i = 0; i < 10; i++) {
    tasks1.push(pool1.exec(fibonacci, [20 + (i % 5)]));
  }

  const results1 = await Promise.all(tasks1);
  console.log('  Results:', results1.slice(0, 5).join(', '), '...');

  // Get pool stats
  const stats1 = pool1.stats();
  console.log('  Total workers:', stats1.totalWorkers);
  console.log('  Tasks completed:', stats1.activeTasks + stats1.pendingTasks === 0 ? 10 : 'still running');

  await pool1.terminate();

  // ============================================================
  // Example 2: Comparing different strategies
  // ============================================================
  console.log('\n2. Comparing worker choice strategies\n');

  const strategies = ['round-robin', 'least-busy', 'least-used', 'fair-share'];

  for (const strategy of strategies) {
    const pool = workerpool.advancedPool({
      maxWorkers: 4,
      workerChoiceStrategy: strategy,
    });

    const start = Date.now();
    const tasks = [];

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

  const pool3 = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: true,
    stealingPolicy: 'busiest-first', // Steal from busiest worker
  });

  // Create an imbalanced workload
  const tasks3 = [];
  for (let i = 0; i < 20; i++) {
    // First 5 tasks are heavy, rest are light
    const complexity = i < 5 ? 28 : 15;
    tasks3.push(pool3.exec(fibonacci, [complexity]));
  }

  const start3 = Date.now();
  await Promise.all(tasks3);
  console.log(`  Completed imbalanced workload in ${Date.now() - start3}ms`);
  console.log('  Work stealing helps balance heavy tasks across workers');

  await pool3.terminate();

  // ============================================================
  // Example 4: Factory functions for specific workloads
  // ============================================================
  console.log('\n4. Specialized pool factories\n');

  // CPU-intensive pool (optimized for compute-heavy tasks)
  const cpuPool = workerpool.cpuIntensivePool({ maxWorkers: 4 });
  console.log('  cpuIntensivePool: Uses least-busy strategy');

  // I/O-intensive pool (optimized for I/O-bound tasks)
  const ioPool = workerpool.ioIntensivePool({ maxWorkers: 8 });
  console.log('  ioIntensivePool: Uses round-robin, more workers');

  // Mixed workload pool (balanced configuration)
  const mixedPool = workerpool.mixedWorkloadPool({ maxWorkers: 4 });
  console.log('  mixedWorkloadPool: Uses fair-share strategy');

  // Quick demo
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

  const pool5 = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
  });

  console.log('  Starting with round-robin strategy');

  // Execute some tasks
  await pool5.exec(fibonacci, [20]);

  // Switch to least-busy for heavy workload
  pool5.setWorkerChoiceStrategy('least-busy');
  console.log('  Switched to least-busy strategy');

  await pool5.exec(fibonacci, [25]);

  // Switch to fair-share for long-running session
  pool5.setWorkerChoiceStrategy('fair-share');
  console.log('  Switched to fair-share strategy');

  await pool5.exec(fibonacci, [20]);

  await pool5.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Advanced Pool examples completed!');
}

main().catch(console.error);

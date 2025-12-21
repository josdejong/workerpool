/**
 * Work Stealing Example (TypeScript)
 *
 * Demonstrates work stealing for load balancing:
 * - WorkStealingDeque: Lock-free double-ended queue
 * - WorkStealingScheduler: Coordinates stealing between workers
 * - Stealing policies: busiest-first, random, round-robin
 *
 * Run with: npx tsx examples/typescript/workStealing.ts
 */

import {
  advancedPool,
  WorkStealingDeque,
  WorkStealingScheduler,
  rebalanceTasks,
  type StealingPolicy,
  type WorkStealingStats,
} from '../../dist/ts/full.js';

/**
 * Variable-duration task
 */
function variableWork(complexity: number): number {
  let result = 0;
  for (let i = 0; i < complexity * 100000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

async function main(): Promise<void> {
  console.log('Work Stealing Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: WorkStealingDeque basics
  // ============================================================
  console.log('\n1. WorkStealingDeque data structure\n');

  const deque = new WorkStealingDeque<number>(0, 16);
  console.log('  Created deque for worker 0');

  // Owner pushes to bottom (LIFO for locality)
  for (let i = 1; i <= 5; i++) {
    deque.pushBottom(i);
  }
  console.log('  Pushed 5 items:', [1, 2, 3, 4, 5].join(', '));

  // Owner pops from bottom (LIFO)
  const popped = deque.popBottom();
  console.log('  Owner popped from bottom:', popped);

  // Thief steals from top (FIFO)
  const stolen = deque.steal();
  console.log('  Thief stole from top:', stolen);

  console.log('  Deque size:', deque.size());

  const stats = deque.getStats();
  console.log('  Stats:', JSON.stringify(stats));

  // ============================================================
  // Example 2: Pool without work stealing (baseline)
  // ============================================================
  console.log('\n2. Imbalanced workload WITHOUT work stealing\n');

  const poolNoStealing = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: false,
  });

  const tasks1: Promise<number>[] = [];
  for (let i = 0; i < 20; i++) {
    const complexity = i < 5 ? 100 : 10;
    tasks1.push(poolNoStealing.exec(variableWork, [complexity]));
  }

  const start1 = Date.now();
  await Promise.all(tasks1);
  const elapsed1 = Date.now() - start1;

  console.log(`  Completed in ${elapsed1}ms`);

  await poolNoStealing.terminate();

  // ============================================================
  // Example 3: Pool WITH work stealing
  // ============================================================
  console.log('\n3. Imbalanced workload WITH work stealing\n');

  const poolWithStealing = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: true,
    stealingPolicy: 'busiest-first',
  });

  const tasks2: Promise<number>[] = [];
  for (let i = 0; i < 20; i++) {
    const complexity = i < 5 ? 100 : 10;
    tasks2.push(poolWithStealing.exec(variableWork, [complexity]));
  }

  const start2 = Date.now();
  await Promise.all(tasks2);
  const elapsed2 = Date.now() - start2;

  console.log(`  Completed in ${elapsed2}ms`);

  const improvement = ((elapsed1 - elapsed2) / elapsed1 * 100).toFixed(1);
  console.log(`  Improvement: ${improvement}% faster`);

  await poolWithStealing.terminate();

  // ============================================================
  // Example 4: Different stealing policies
  // ============================================================
  console.log('\n4. Comparing stealing policies\n');

  const policies: StealingPolicy[] = ['busiest-first', 'random', 'round-robin'];

  for (const policy of policies) {
    const pool = advancedPool({
      maxWorkers: 4,
      workerChoiceStrategy: 'round-robin',
      enableWorkStealing: true,
      stealingPolicy: policy,
    });

    const tasks: Promise<number>[] = [];
    for (let i = 0; i < 20; i++) {
      const complexity = i < 5 ? 100 : 10;
      tasks.push(pool.exec(variableWork, [complexity]));
    }

    const start = Date.now();
    await Promise.all(tasks);
    const elapsed = Date.now() - start;

    console.log(`  ${policy.padEnd(15)} completed in ${elapsed}ms`);

    await pool.terminate();
  }

  // ============================================================
  // Example 5: WorkStealingScheduler (low-level API)
  // ============================================================
  console.log('\n5. WorkStealingScheduler (low-level API)\n');

  interface TaskData {
    id: number;
    data: string;
  }

  const scheduler = new WorkStealingScheduler<TaskData>({
    numWorkers: 4,
    stealingPolicy: 'busiest-first',
    maxStealAttempts: 3,
  });

  console.log('  Created scheduler for 4 workers');

  for (let i = 0; i < 10; i++) {
    const workerId = i % 4;
    scheduler.submitTask(workerId, { id: i, data: `task-${i}` });
  }

  console.log('  Submitted 10 tasks across 4 workers');

  const schedStats: WorkStealingStats = scheduler.getStats();
  console.log('  Total tasks:', schedStats.totalTasks);
  console.log('  Steal attempts:', schedStats.stealAttempts);

  const rebalanced = rebalanceTasks(scheduler, { threshold: 2 });
  console.log('  Tasks rebalanced:', rebalanced);

  console.log('\n' + '='.repeat(50));
  console.log('Work Stealing examples completed!');
}

main().catch(console.error);

/**
 * Shared Pool Example (TypeScript)
 *
 * Demonstrates singleton pool management:
 * - getSharedPool: Get or create a shared pool instance
 * - hasSharedPool: Check if shared pool exists
 * - terminateSharedPool: Terminate the shared pool
 *
 * Useful for:
 * - Application-wide pool sharing
 * - Avoiding pool creation overhead
 * - Centralized worker management
 *
 * Run with: npx tsx examples/typescript/sharedPool.ts
 */

import {
  getSharedPool,
  hasSharedPool,
  terminateSharedPool,
  cpus,
  type Pool,
  type PoolStats,
  type PoolOptions,
} from '../../dist/ts/full.js';

interface ModuleResult {
  module: string;
  processed?: number;
  length?: number;
  sum?: number;
}

/**
 * Module A: Uses shared pool for data processing
 */
async function moduleA(): Promise<ModuleResult> {
  console.log('  [Module A] Getting shared pool...');

  const pool: Pool = getSharedPool({
    maxWorkers: 4,
    workerType: 'auto',
  });

  const result = await pool.exec((data: number[]): ModuleResult => {
    return { module: 'A', processed: data.length };
  }, [[1, 2, 3, 4, 5]]);

  console.log('  [Module A] Result:', result);
  return result;
}

/**
 * Module B: Uses the same shared pool
 */
async function moduleB(): Promise<ModuleResult> {
  console.log('  [Module B] Getting shared pool...');

  const pool: Pool = getSharedPool({
    maxWorkers: 4,
  });

  const result = await pool.exec((text: string): ModuleResult => {
    return { module: 'B', length: text.length };
  }, ['Hello, World!']);

  console.log('  [Module B] Result:', result);
  return result;
}

/**
 * Module C: Another consumer of the shared pool
 */
async function moduleC(): Promise<ModuleResult> {
  console.log('  [Module C] Getting shared pool...');

  const pool: Pool = getSharedPool();

  const result = await pool.exec((n: number): ModuleResult => {
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += i;
    return { module: 'C', sum };
  }, [100]);

  console.log('  [Module C] Result:', result);
  return result;
}

async function main(): Promise<void> {
  console.log('Shared Pool Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Check if shared pool exists
  // ============================================================
  console.log('\n1. Initial state\n');

  console.log('  hasSharedPool:', hasSharedPool());

  // ============================================================
  // Example 2: Multiple modules using shared pool
  // ============================================================
  console.log('\n2. Multiple modules using shared pool\n');

  await moduleA();
  console.log('  hasSharedPool after A:', hasSharedPool());

  await moduleB();
  console.log('  Pool reused by B');

  await moduleC();
  console.log('  Pool reused by C');

  // ============================================================
  // Example 3: Pool stats from shared pool
  // ============================================================
  console.log('\n3. Shared pool stats\n');

  const pool: Pool = getSharedPool();
  const stats: PoolStats = pool.stats();

  console.log('  Total workers:', stats.totalWorkers);
  console.log('  Busy workers:', stats.busyWorkers);
  console.log('  Idle workers:', stats.idleWorkers);
  console.log('  Pending tasks:', stats.pendingTasks);

  // ============================================================
  // Example 4: Concurrent access to shared pool
  // ============================================================
  console.log('\n4. Concurrent access\n');

  const promises: Promise<ModuleResult>[] = [
    moduleA(),
    moduleB(),
    moduleC(),
  ];

  const results = await Promise.all(promises);
  console.log('  All modules completed concurrently');
  console.log('  Results:', results.map(r => r.module).join(', '));

  // ============================================================
  // Example 5: Terminate shared pool
  // ============================================================
  console.log('\n5. Terminate shared pool\n');

  console.log('  hasSharedPool before terminate:', hasSharedPool());

  await terminateSharedPool();
  console.log('  Shared pool terminated');

  console.log('  hasSharedPool after terminate:', hasSharedPool());

  // ============================================================
  // Example 6: Create new shared pool after termination
  // ============================================================
  console.log('\n6. Create new shared pool\n');

  const newPool: Pool = getSharedPool({
    maxWorkers: 2,
    workerType: 'auto',
  });

  console.log('  New shared pool created with maxWorkers: 2');

  const result = await newPool.exec((x: number) => x * 2, [21]);
  console.log('  Test result:', result);

  // ============================================================
  // Example 7: Use case - Application startup
  // ============================================================
  console.log('\n7. Use case: Application startup pattern\n');

  function initializeApp(): Pool {
    const appPool = getSharedPool({
      maxWorkers: Math.max(cpus - 1, 1),
      minWorkers: 2,
    });

    console.log('  App initialized with shared worker pool');
    return appPool;
  }

  async function shutdownApp(): Promise<void> {
    if (hasSharedPool()) {
      await terminateSharedPool();
      console.log('  Shared pool cleaned up');
    }
  }

  initializeApp();
  await shutdownApp();

  // ============================================================
  // Example 8: Pattern - Lazy initialization
  // ============================================================
  console.log('\n8. Pattern: Lazy initialization\n');

  function getPool(): Pool {
    if (!hasSharedPool()) {
      console.log('  Creating shared pool on first use...');
    }
    return getSharedPool({ maxWorkers: 4 });
  }

  const lazyPool1 = getPool();
  const lazyPool2 = getPool();
  console.log('  Same instance:', lazyPool1 === lazyPool2);

  await terminateSharedPool();

  console.log('\n' + '='.repeat(50));
  console.log('Shared Pool examples completed!');
}

main().catch(console.error);

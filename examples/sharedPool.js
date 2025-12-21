/**
 * Shared Pool Example
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
 * Run with: node examples/sharedPool.js
 */

const workerpool = require('../dist/ts/index.js');

/**
 * Module A: Uses shared pool for image processing
 */
async function moduleA() {
  console.log('  [Module A] Getting shared pool...');

  const pool = workerpool.getSharedPool({
    maxWorkers: 4,
    workerType: 'auto',
  });

  const result = await pool.exec((data) => {
    return { module: 'A', processed: data.length };
  }, [[1, 2, 3, 4, 5]]);

  console.log('  [Module A] Result:', result);
  return result;
}

/**
 * Module B: Uses the same shared pool for data processing
 */
async function moduleB() {
  console.log('  [Module B] Getting shared pool...');

  // Gets the same pool instance (already created by Module A)
  const pool = workerpool.getSharedPool({
    maxWorkers: 4, // Options ignored if pool already exists
  });

  const result = await pool.exec((text) => {
    return { module: 'B', length: text.length };
  }, ['Hello, World!']);

  console.log('  [Module B] Result:', result);
  return result;
}

/**
 * Module C: Another consumer of the shared pool
 */
async function moduleC() {
  console.log('  [Module C] Getting shared pool...');

  const pool = workerpool.getSharedPool();

  const result = await pool.exec((n) => {
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += i;
    return { module: 'C', sum };
  }, [100]);

  console.log('  [Module C] Result:', result);
  return result;
}

async function main() {
  console.log('Shared Pool Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Check if shared pool exists
  // ============================================================
  console.log('\n1. Initial state\n');

  console.log('  hasSharedPool:', workerpool.hasSharedPool());

  // ============================================================
  // Example 2: Multiple modules using shared pool
  // ============================================================
  console.log('\n2. Multiple modules using shared pool\n');

  // Run modules in sequence
  await moduleA();
  console.log('  hasSharedPool after A:', workerpool.hasSharedPool());

  await moduleB();
  console.log('  Pool reused by B');

  await moduleC();
  console.log('  Pool reused by C');

  // ============================================================
  // Example 3: Pool stats from shared pool
  // ============================================================
  console.log('\n3. Shared pool stats\n');

  const pool = workerpool.getSharedPool();
  const stats = pool.stats();

  console.log('  Total workers:', stats.totalWorkers);
  console.log('  Busy workers:', stats.busyWorkers);
  console.log('  Idle workers:', stats.idleWorkers);
  console.log('  Pending tasks:', stats.pendingTasks);

  // ============================================================
  // Example 4: Concurrent access to shared pool
  // ============================================================
  console.log('\n4. Concurrent access\n');

  // All modules can access the pool concurrently
  const promises = [
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

  console.log('  hasSharedPool before terminate:', workerpool.hasSharedPool());

  await workerpool.terminateSharedPool();
  console.log('  Shared pool terminated');

  console.log('  hasSharedPool after terminate:', workerpool.hasSharedPool());

  // ============================================================
  // Example 6: Create new shared pool after termination
  // ============================================================
  console.log('\n6. Create new shared pool\n');

  // Can create a new shared pool with different settings
  const newPool = workerpool.getSharedPool({
    maxWorkers: 2,
    workerType: 'auto',
  });

  console.log('  New shared pool created with maxWorkers: 2');

  const result = await newPool.exec((x) => x * 2, [21]);
  console.log('  Test result:', result);

  // ============================================================
  // Example 7: Use case - Application startup
  // ============================================================
  console.log('\n7. Use case: Application startup pattern\n');

  // In your main application entry point:
  function initializeApp() {
    // Pre-warm the shared pool
    const pool = workerpool.getSharedPool({
      maxWorkers: Math.max(workerpool.cpus - 1, 1),
      minWorkers: 2, // Keep at least 2 workers ready
    });

    console.log('  App initialized with shared worker pool');
    return pool;
  }

  // In your cleanup/shutdown code:
  async function shutdownApp() {
    if (workerpool.hasSharedPool()) {
      await workerpool.terminateSharedPool();
      console.log('  Shared pool cleaned up');
    }
  }

  initializeApp();

  // ... app runs ...

  await shutdownApp();

  // ============================================================
  // Example 8: Pattern - Lazy initialization
  // ============================================================
  console.log('\n8. Pattern: Lazy initialization\n');

  // Helper that lazily gets the pool only when needed
  function getPool() {
    if (!workerpool.hasSharedPool()) {
      console.log('  Creating shared pool on first use...');
    }
    return workerpool.getSharedPool({ maxWorkers: 4 });
  }

  // First call creates the pool
  const lazyPool1 = getPool();

  // Subsequent calls reuse it
  const lazyPool2 = getPool();
  console.log('  Same instance:', lazyPool1 === lazyPool2);

  // Cleanup
  await workerpool.terminateSharedPool();

  console.log('\n' + '='.repeat(50));
  console.log('Shared Pool examples completed!');
}

main().catch(console.error);

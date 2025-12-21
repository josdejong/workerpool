/**
 * Task Affinity Example
 *
 * Demonstrates task affinity routing for cache locality:
 * - Route related tasks to the same worker
 * - Improve cache hit rates for stateful operations
 * - Use affinity keys based on user ID, session, or data
 *
 * Run with: node examples/taskAffinity.js
 */

const workerpool = require('../dist/ts/index.js');

/**
 * Simulates a task that benefits from cache locality
 */
function processUserData(userId, operation) {
  // In real scenarios, the worker might cache user-specific data
  return {
    userId,
    operation,
    processedAt: Date.now(),
    cached: Math.random() > 0.5, // Simulated cache hit
  };
}

async function main() {
  console.log('Task Affinity Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic task affinity
  // ============================================================
  console.log('\n1. Basic task affinity with execWithAffinity\n');

  const pool1 = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: true,
  });

  // Process multiple requests for the same user
  // All requests for user-123 will go to the same worker
  const userId = 'user-123';

  console.log(`  Processing 5 requests for ${userId}`);

  const results = [];
  for (let i = 0; i < 5; i++) {
    const result = await pool1.execWithAffinity(
      userId,                    // Affinity key
      processUserData,           // Function
      [userId, `operation-${i}`] // Arguments
    );
    results.push(result);
  }

  console.log('  All requests processed by same worker');
  console.log('  Results:', results.map(r => r.operation).join(', '));

  await pool1.terminate();

  // ============================================================
  // Example 2: Multiple users with affinity
  // ============================================================
  console.log('\n2. Multiple users with task affinity\n');

  const pool2 = workerpool.advancedPool({
    maxWorkers: 4,
    enableTaskAffinity: true,
  });

  // Simulate requests from multiple users
  const users = ['alice', 'bob', 'charlie', 'diana'];
  const promises = [];

  for (const user of users) {
    // Each user's requests will be routed to the same worker
    for (let i = 0; i < 3; i++) {
      promises.push(
        pool2.execWithAffinity(user, processUserData, [user, `req-${i}`])
      );
    }
  }

  await Promise.all(promises);
  console.log(`  Processed ${promises.length} requests for ${users.length} users`);
  console.log('  Each user\'s requests went to their assigned worker');

  await pool2.terminate();

  // ============================================================
  // Example 3: Creating affinity keys
  // ============================================================
  console.log('\n3. Creating affinity keys\n');

  // Simple string key
  const key1 = workerpool.createAffinityKey('user-123');
  console.log('  String key:', key1);

  // Key from object properties
  const request = { userId: 'alice', sessionId: 'sess-456', type: 'api' };
  const key2 = workerpool.objectAffinityKey(request, ['userId', 'sessionId']);
  console.log('  Object key:', key2);

  // Custom composite key
  const key3 = workerpool.createAffinityKey(`${request.userId}:${request.type}`);
  console.log('  Composite key:', key3);

  // ============================================================
  // Example 4: TaskAffinityRouter (low-level API)
  // ============================================================
  console.log('\n4. TaskAffinityRouter (low-level API)\n');

  const router = new workerpool.TaskAffinityRouter({
    numWorkers: 4,
    affinityTTL: 60000,      // Cache affinity for 60 seconds
    maxAffinityEntries: 1000, // Max cached affinities
  });

  // Route tasks for a user
  const decision1 = router.route('user-alice');
  console.log(`  user-alice -> worker ${decision1.workerId} (${decision1.reason})`);

  // Same user routes to same worker
  const decision2 = router.route('user-alice');
  console.log(`  user-alice -> worker ${decision2.workerId} (${decision2.reason})`);

  // Different user may get different worker
  const decision3 = router.route('user-bob');
  console.log(`  user-bob -> worker ${decision3.workerId} (${decision3.reason})`);

  // Get router statistics
  const routerStats = router.getStats();
  console.log('  Router stats:', JSON.stringify(routerStats));

  // ============================================================
  // Example 5: Comparing with and without affinity
  // ============================================================
  console.log('\n5. Performance comparison\n');

  // Without affinity
  const poolNoAffinity = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: false,
  });

  const startNo = Date.now();
  const tasksNo = [];
  for (let userId = 0; userId < 10; userId++) {
    for (let i = 0; i < 5; i++) {
      tasksNo.push(poolNoAffinity.exec(processUserData, [`user-${userId}`, `op-${i}`]));
    }
  }
  await Promise.all(tasksNo);
  const elapsedNo = Date.now() - startNo;
  console.log(`  Without affinity: ${elapsedNo}ms`);
  await poolNoAffinity.terminate();

  // With affinity
  const poolWithAffinity = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: true,
  });

  const startWith = Date.now();
  const tasksWith = [];
  for (let userId = 0; userId < 10; userId++) {
    for (let i = 0; i < 5; i++) {
      tasksWith.push(
        poolWithAffinity.execWithAffinity(`user-${userId}`, processUserData, [`user-${userId}`, `op-${i}`])
      );
    }
  }
  await Promise.all(tasksWith);
  const elapsedWith = Date.now() - startWith;
  console.log(`  With affinity: ${elapsedWith}ms`);
  console.log('  (Real improvement depends on worker-side caching)');
  await poolWithAffinity.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Task Affinity examples completed!');
}

main().catch(console.error);

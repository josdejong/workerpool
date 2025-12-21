/**
 * Task Affinity Example (TypeScript)
 *
 * Demonstrates task affinity routing for cache locality:
 * - Route related tasks to the same worker
 * - Improve cache hit rates for stateful operations
 * - Use affinity keys based on user ID, session, or data
 *
 * Run with: npx tsx examples/typescript/taskAffinity.ts
 */

import {
  advancedPool,
  TaskAffinityRouter,
  createAffinityKey,
  objectAffinityKey,
  type AffinityKey,
  type RoutingDecision,
  type AffinityRouterStats,
} from '../../dist/ts/full.js';

interface UserResult {
  userId: string;
  operation: string;
  processedAt: number;
  cached: boolean;
}

interface RequestData {
  userId: string;
  sessionId: string;
  type: string;
}

/**
 * Simulates a task that benefits from cache locality
 */
function processUserData(userId: string, operation: string): UserResult {
  return {
    userId,
    operation,
    processedAt: Date.now(),
    cached: Math.random() > 0.5,
  };
}

async function main(): Promise<void> {
  console.log('Task Affinity Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic task affinity
  // ============================================================
  console.log('\n1. Basic task affinity with execWithAffinity\n');

  const pool1 = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: true,
  });

  const userId = 'user-123';
  console.log(`  Processing 5 requests for ${userId}`);

  const results: UserResult[] = [];
  for (let i = 0; i < 5; i++) {
    const result = await pool1.execWithAffinity(
      userId,
      processUserData,
      [userId, `operation-${i}`]
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

  const pool2 = advancedPool({
    maxWorkers: 4,
    enableTaskAffinity: true,
  });

  const users = ['alice', 'bob', 'charlie', 'diana'];
  const promises: Promise<UserResult>[] = [];

  for (const user of users) {
    for (let i = 0; i < 3; i++) {
      promises.push(
        pool2.execWithAffinity(user, processUserData, [user, `req-${i}`])
      );
    }
  }

  await Promise.all(promises);
  console.log(`  Processed ${promises.length} requests for ${users.length} users`);

  await pool2.terminate();

  // ============================================================
  // Example 3: Creating affinity keys
  // ============================================================
  console.log('\n3. Creating affinity keys\n');

  const key1: AffinityKey = createAffinityKey('user-123');
  console.log('  String key:', key1);

  const request: RequestData = { userId: 'alice', sessionId: 'sess-456', type: 'api' };
  const key2: AffinityKey = objectAffinityKey(request, ['userId', 'sessionId']);
  console.log('  Object key:', key2);

  const key3: AffinityKey = createAffinityKey(`${request.userId}:${request.type}`);
  console.log('  Composite key:', key3);

  // ============================================================
  // Example 4: TaskAffinityRouter (low-level API)
  // ============================================================
  console.log('\n4. TaskAffinityRouter (low-level API)\n');

  const router = new TaskAffinityRouter({
    numWorkers: 4,
    affinityTTL: 60000,
    maxAffinityEntries: 1000,
  });

  const decision1: RoutingDecision = router.route('user-alice');
  console.log(`  user-alice -> worker ${decision1.workerId} (${decision1.reason})`);

  const decision2: RoutingDecision = router.route('user-alice');
  console.log(`  user-alice -> worker ${decision2.workerId} (${decision2.reason})`);

  const decision3: RoutingDecision = router.route('user-bob');
  console.log(`  user-bob -> worker ${decision3.workerId} (${decision3.reason})`);

  const routerStats: AffinityRouterStats = router.getStats();
  console.log('  Router stats:', JSON.stringify(routerStats));

  // ============================================================
  // Example 5: Comparing with and without affinity
  // ============================================================
  console.log('\n5. Performance comparison\n');

  const poolNoAffinity = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: false,
  });

  const startNo = Date.now();
  const tasksNo: Promise<UserResult>[] = [];
  for (let uid = 0; uid < 10; uid++) {
    for (let i = 0; i < 5; i++) {
      tasksNo.push(poolNoAffinity.exec(processUserData, [`user-${uid}`, `op-${i}`]));
    }
  }
  await Promise.all(tasksNo);
  console.log(`  Without affinity: ${Date.now() - startNo}ms`);
  await poolNoAffinity.terminate();

  const poolWithAffinity = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: true,
  });

  const startWith = Date.now();
  const tasksWith: Promise<UserResult>[] = [];
  for (let uid = 0; uid < 10; uid++) {
    for (let i = 0; i < 5; i++) {
      tasksWith.push(
        poolWithAffinity.execWithAffinity(`user-${uid}`, processUserData, [`user-${uid}`, `op-${i}`])
      );
    }
  }
  await Promise.all(tasksWith);
  console.log(`  With affinity: ${Date.now() - startWith}ms`);
  await poolWithAffinity.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Task Affinity examples completed!');
}

main().catch(console.error);

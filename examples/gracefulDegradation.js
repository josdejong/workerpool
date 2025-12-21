/**
 * Graceful Degradation Example
 *
 * Demonstrates fallback to main thread execution:
 * - MainThreadExecutor: Same API as Pool, runs on main thread
 * - createPoolWithFallback: Auto-detects worker support
 * - hasWorkerSupport: Check if workers are available
 *
 * Useful for:
 * - Environments without Web Worker support
 * - Server-side rendering (SSR)
 * - Testing and debugging
 *
 * Run with: node examples/gracefulDegradation.js
 */

const workerpool = require('../dist/ts/index.js');

/**
 * Example task function
 */
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Another example task
 */
function processData(data) {
  return {
    ...data,
    processed: true,
    timestamp: Date.now(),
  };
}

async function main() {
  console.log('Graceful Degradation Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Check worker support
  // ============================================================
  console.log('\n1. Checking worker support\n');

  const hasSupport = workerpool.hasWorkerSupport();
  console.log('  Web Workers supported:', hasSupport);

  // Get detailed runtime info
  const runtimeInfo = workerpool.getRuntimeInfo();
  console.log('  Runtime:', runtimeInfo.runtime);
  console.log('  Version:', runtimeInfo.version);
  console.log('  Recommended worker type:', runtimeInfo.recommendedWorkerType);
  console.log('  Worker type support:', JSON.stringify(runtimeInfo.workerTypeSupport));

  // ============================================================
  // Example 2: MainThreadExecutor (same API as Pool)
  // ============================================================
  console.log('\n2. MainThreadExecutor\n');

  // Create executor with registered methods
  const executor = workerpool.mainThreadExecutor({
    methods: {
      fibonacci: fibonacci,
      processData: processData,
      add: (a, b) => a + b,
      multiply: (a, b) => a * b,
    },
  });

  // Execute methods - same API as pool.exec()
  const fibResult = await executor.exec('fibonacci', [20]);
  console.log('  fibonacci(20):', fibResult);

  const dataResult = await executor.exec('processData', [{ id: 1, name: 'test' }]);
  console.log('  processData:', JSON.stringify(dataResult));

  // Execute inline functions
  const inlineResult = await executor.exec((x, y) => x + y, [10, 20]);
  console.log('  Inline function (10 + 20):', inlineResult);

  // Get stats (similar to pool.stats())
  const stats = executor.stats();
  console.log('  Executor stats:', JSON.stringify(stats));

  // Proxy API works too
  const proxy = await executor.proxy();
  const proxyResult = await proxy.add(5, 3);
  console.log('  Proxy add(5, 3):', proxyResult);

  await executor.terminate();

  // ============================================================
  // Example 3: createPoolWithFallback
  // ============================================================
  console.log('\n3. createPoolWithFallback\n');

  // Automatically uses Pool if workers are available,
  // falls back to MainThreadExecutor if not
  const autoPool = workerpool.createPoolWithFallback({
    methods: {
      compute: (n) => n * n,
      greet: (name) => `Hello, ${name}!`,
    },
  });

  console.log('  Created pool with fallback');

  const computeResult = await autoPool.exec('compute', [7]);
  console.log('  compute(7):', computeResult);

  const greetResult = await autoPool.exec('greet', ['World']);
  console.log('  greet("World"):', greetResult);

  await autoPool.terminate();

  // ============================================================
  // Example 4: MainThreadExecutor with map/reduce
  // ============================================================
  console.log('\n4. Parallel operations on main thread\n');

  const executor2 = workerpool.mainThreadExecutor({
    methods: {},
  });

  // Map operation
  const numbers = [1, 2, 3, 4, 5];
  const squared = await executor2.map(numbers, (x) => x * x);
  console.log('  map (square):', squared.join(', '));

  // Reduce operation
  const sum = await executor2.reduce(
    numbers,
    (acc, x) => acc + x,
    (left, right) => left + right,
    { initialValue: 0 }
  );
  console.log('  reduce (sum):', sum);

  // Filter operation
  const evens = await executor2.filter(numbers, (x) => x % 2 === 0);
  console.log('  filter (evens):', evens.join(', '));

  await executor2.terminate();

  // ============================================================
  // Example 5: Error handling comparison
  // ============================================================
  console.log('\n5. Error handling\n');

  const executor3 = workerpool.mainThreadExecutor({
    methods: {
      throwError: () => {
        throw new Error('Intentional error');
      },
    },
  });

  try {
    await executor3.exec('throwError', []);
  } catch (error) {
    console.log('  Caught error:', error.message);
  }

  // Method not found
  try {
    await executor3.exec('nonExistent', []);
  } catch (error) {
    console.log('  Method not found:', error.message);
  }

  await executor3.terminate();

  // ============================================================
  // Example 6: Comparison with real Pool
  // ============================================================
  console.log('\n6. Comparison: Pool vs MainThreadExecutor\n');

  // Real pool (uses workers)
  const realPool = workerpool.pool({ maxWorkers: 2 });

  // Main thread executor (no workers)
  const mainThread = workerpool.mainThreadExecutor({
    methods: {},
  });

  // Both have the same API
  const poolResult = await realPool.exec(fibonacci, [25]);
  const mainResult = await mainThread.exec(fibonacci, [25]);

  console.log('  Pool result:', poolResult);
  console.log('  MainThread result:', mainResult);
  console.log('  Results match:', poolResult === mainResult);

  // Stats comparison
  const poolStats = realPool.stats();
  const mainStats = mainThread.stats();

  console.log('  Pool workers:', poolStats.totalWorkers);
  console.log('  MainThread workers:', mainStats.totalWorkers, '(simulated)');

  await Promise.all([
    realPool.terminate(),
    mainThread.terminate(),
  ]);

  // ============================================================
  // Example 7: Use case - SSR/Testing
  // ============================================================
  console.log('\n7. Use case: SSR/Testing pattern\n');

  // Pattern for isomorphic code
  function createExecutor() {
    // In test/SSR environments, use main thread
    const isTestEnv = process.env.NODE_ENV === 'test';
    const isSSR = typeof window === 'undefined' && !workerpool.hasWorkerSupport();

    if (isTestEnv || isSSR) {
      console.log('  Using MainThreadExecutor (test/SSR mode)');
      return workerpool.mainThreadExecutor({
        methods: {
          processItem: (item) => ({ ...item, processed: true }),
        },
      });
    } else {
      console.log('  Using real Pool (production mode)');
      return workerpool.createPoolWithFallback({
        methods: {
          processItem: (item) => ({ ...item, processed: true }),
        },
      });
    }
  }

  const myExecutor = createExecutor();
  const itemResult = await myExecutor.exec('processItem', [{ id: 1 }]);
  console.log('  Processed item:', JSON.stringify(itemResult));

  await myExecutor.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Graceful Degradation examples completed!');
}

main().catch(console.error);

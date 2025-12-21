/**
 * Graceful Degradation Example (TypeScript)
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
 * Run with: npx tsx examples/typescript/gracefulDegradation.ts
 */

import {
  pool,
  MainThreadExecutor,
  mainThreadExecutor,
  createPoolWithFallback,
  hasWorkerSupport,
  getRuntimeInfo,
  type MainThreadExecutorOptions,
  type PoolStats,
} from '../../dist/ts/full.js';

interface ProcessedItem {
  id: number;
  processed: boolean;
}

/**
 * Example task function
 */
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Another example task
 */
function processData<T extends object>(data: T): T & { processed: boolean; timestamp: number } {
  return {
    ...data,
    processed: true,
    timestamp: Date.now(),
  };
}

async function main(): Promise<void> {
  console.log('Graceful Degradation Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Check worker support
  // ============================================================
  console.log('\n1. Checking worker support\n');

  const hasSupport: boolean = hasWorkerSupport();
  console.log('  Web Workers supported:', hasSupport);

  const runtimeInfo = getRuntimeInfo();
  console.log('  Runtime:', runtimeInfo.runtime);
  console.log('  Version:', runtimeInfo.version);
  console.log('  Recommended worker type:', runtimeInfo.recommendedWorkerType);
  console.log('  Worker type support:', JSON.stringify(runtimeInfo.workerTypeSupport));

  // ============================================================
  // Example 2: MainThreadExecutor (same API as Pool)
  // ============================================================
  console.log('\n2. MainThreadExecutor\n');

  const executorOptions: MainThreadExecutorOptions = {
    methods: {
      fibonacci: fibonacci,
      processData: processData,
      add: (a: number, b: number) => a + b,
      multiply: (a: number, b: number) => a * b,
    },
  };

  const executor = mainThreadExecutor(executorOptions);

  const fibResult = await executor.exec('fibonacci', [20]);
  console.log('  fibonacci(20):', fibResult);

  const dataResult = await executor.exec('processData', [{ id: 1, name: 'test' }]);
  console.log('  processData:', JSON.stringify(dataResult));

  const inlineResult = await executor.exec((x: number, y: number) => x + y, [10, 20]);
  console.log('  Inline function (10 + 20):', inlineResult);

  const stats: PoolStats = executor.stats();
  console.log('  Executor stats:', JSON.stringify(stats));

  const proxy = await executor.proxy();
  const proxyResult = await (proxy as { add: (a: number, b: number) => Promise<number> }).add(5, 3);
  console.log('  Proxy add(5, 3):', proxyResult);

  await executor.terminate();

  // ============================================================
  // Example 3: createPoolWithFallback
  // ============================================================
  console.log('\n3. createPoolWithFallback\n');

  const autoPool = createPoolWithFallback({
    methods: {
      compute: (n: number) => n * n,
      greet: (name: string) => `Hello, ${name}!`,
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

  const executor2 = mainThreadExecutor({ methods: {} });

  const numbers = [1, 2, 3, 4, 5];
  const squared = await executor2.map(numbers, (x: number) => x * x);
  console.log('  map (square):', squared.join(', '));

  const sum = await executor2.reduce(
    numbers,
    (acc: number, x: number) => acc + x,
    (left: number, right: number) => left + right,
    { initialValue: 0 }
  );
  console.log('  reduce (sum):', sum);

  const evens = await executor2.filter(numbers, (x: number) => x % 2 === 0);
  console.log('  filter (evens):', evens.join(', '));

  await executor2.terminate();

  // ============================================================
  // Example 5: Error handling comparison
  // ============================================================
  console.log('\n5. Error handling\n');

  const executor3 = mainThreadExecutor({
    methods: {
      throwError: (): never => {
        throw new Error('Intentional error');
      },
    },
  });

  try {
    await executor3.exec('throwError', []);
  } catch (error) {
    console.log('  Caught error:', (error as Error).message);
  }

  try {
    await executor3.exec('nonExistent', []);
  } catch (error) {
    console.log('  Method not found:', (error as Error).message);
  }

  await executor3.terminate();

  // ============================================================
  // Example 6: Comparison with real Pool
  // ============================================================
  console.log('\n6. Comparison: Pool vs MainThreadExecutor\n');

  const realPool = pool({ maxWorkers: 2 });
  const mainThread = mainThreadExecutor({ methods: {} });

  const poolResult = await realPool.exec(fibonacci, [25]);
  const mainResult = await mainThread.exec(fibonacci, [25]);

  console.log('  Pool result:', poolResult);
  console.log('  MainThread result:', mainResult);
  console.log('  Results match:', poolResult === mainResult);

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

  type ExecutorLike = MainThreadExecutor | ReturnType<typeof createPoolWithFallback>;

  function createExecutor(): ExecutorLike {
    const isTestEnv = process.env.NODE_ENV === 'test';
    const isSSR = typeof window === 'undefined' && !hasWorkerSupport();

    if (isTestEnv || isSSR) {
      console.log('  Using MainThreadExecutor (test/SSR mode)');
      return mainThreadExecutor({
        methods: {
          processItem: (item: { id: number }): ProcessedItem => ({ ...item, processed: true }),
        },
      });
    } else {
      console.log('  Using real Pool (production mode)');
      return createPoolWithFallback({
        methods: {
          processItem: (item: { id: number }): ProcessedItem => ({ ...item, processed: true }),
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

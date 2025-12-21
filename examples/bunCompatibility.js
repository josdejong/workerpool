/**
 * Bun Compatibility Example
 *
 * Demonstrates Bun runtime detection and optimization:
 * - isBun: Detect if running in Bun
 * - bunVersion: Get Bun version
 * - optimalPool: Create pool with best settings for runtime
 * - getRuntimeInfo: Get detailed runtime information
 * - recommendedWorkerType: Best worker type for current runtime
 *
 * Run with:
 *   node examples/bunCompatibility.js   # Node.js
 *   bun examples/bunCompatibility.js    # Bun
 *
 * Both runtimes are fully supported!
 */

const workerpool = require('../dist/ts/index.js');

async function main() {
  console.log('Bun Compatibility Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Runtime detection
  // ============================================================
  console.log('\n1. Runtime detection\n');

  console.log('  Running in Bun:', workerpool.isBun);
  console.log('  Bun version:', workerpool.bunVersion || 'N/A');
  console.log('  Platform:', workerpool.platform);
  console.log('  Is main thread:', workerpool.isMainThread);
  console.log('  CPU cores:', workerpool.cpus);

  // ============================================================
  // Example 2: Detailed runtime info
  // ============================================================
  console.log('\n2. getRuntimeInfo()\n');

  const info = workerpool.getRuntimeInfo();
  console.log('  Runtime:', info.runtime);
  console.log('  Version:', info.version);
  console.log('  Recommended worker type:', info.recommendedWorkerType);
  console.log('  Worker type support:', JSON.stringify(info.workerTypeSupport));

  // ============================================================
  // Example 3: Worker type recommendations
  // ============================================================
  console.log('\n3. Worker type recommendations\n');

  console.log('  Recommended type:', workerpool.recommendedWorkerType);

  // Check support for each type
  const types = ['thread', 'process', 'web', 'auto'];
  for (const type of types) {
    const supported = workerpool.isWorkerTypeSupported(type);
    console.log(`  ${type.padEnd(10)} supported: ${supported}`);
  }

  // Get full support details
  const support = workerpool.getWorkerTypeSupport();
  console.log('  Full support map:', JSON.stringify(support));

  // ============================================================
  // Example 4: optimalPool() - automatic optimization
  // ============================================================
  console.log('\n4. optimalPool() - automatic optimization\n');

  // optimalPool automatically uses the best settings for the runtime
  const pool = workerpool.optimalPool({ maxWorkers: 4 });

  console.log('  Created optimal pool for', info.runtime);
  console.log('  Worker type:', info.recommendedWorkerType);

  // Test execution
  const result = await pool.exec((a, b) => a + b, [10, 20]);
  console.log('  Test execution (10 + 20):', result);

  const stats = pool.stats();
  console.log('  Pool stats:', JSON.stringify({
    totalWorkers: stats.totalWorkers,
    busyWorkers: stats.busyWorkers,
  }));

  await pool.terminate();

  // ============================================================
  // Example 5: Runtime-specific patterns
  // ============================================================
  console.log('\n5. Runtime-specific patterns\n');

  if (workerpool.isBun) {
    console.log('  Bun-specific optimizations:');
    console.log('    - Use workerType: "thread" (worker_threads)');
    console.log('    - Avoid workerType: "process" (IPC issues)');
    console.log('    - TypeScript builds work natively');
  } else {
    console.log('  Node.js optimizations:');
    console.log('    - workerType: "auto" selects best option');
    console.log('    - worker_threads preferred in Node 11.7+');
    console.log('    - child_process fallback available');
  }

  // ============================================================
  // Example 6: Cross-runtime compatible code
  // ============================================================
  console.log('\n6. Cross-runtime compatible code\n');

  // This code works identically in both Node.js and Bun
  function createOptimalPool() {
    return workerpool.optimalPool({
      maxWorkers: Math.max(workerpool.cpus - 1, 1),
    });
  }

  const crossPool = createOptimalPool();
  console.log('  Created cross-runtime pool');

  // Execute same code on both runtimes
  const fibResult = await crossPool.exec(function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }, [20]);

  console.log('  fibonacci(20):', fibResult);

  await crossPool.terminate();

  // ============================================================
  // Example 7: Feature detection
  // ============================================================
  console.log('\n7. Feature detection\n');

  console.log('  hasWorkerThreads:', workerpool.hasWorkerThreads);
  console.log('  hasSharedArrayBuffer:', workerpool.hasSharedArrayBuffer);
  console.log('  hasAtomics:', workerpool.hasAtomics);
  console.log('  hasWorkerSupport:', workerpool.hasWorkerSupport());

  // Get capabilities report
  const capabilities = workerpool.getCapabilities();
  console.log('  Capabilities:', JSON.stringify({
    webWorkers: capabilities.webWorkers,
    workerThreads: capabilities.workerThreads,
    sharedArrayBuffer: capabilities.sharedArrayBuffer,
    transferables: capabilities.transferables,
  }));

  // ============================================================
  // Example 8: Bun vs Node.js performance note
  // ============================================================
  console.log('\n8. Performance notes\n');

  if (workerpool.isBun) {
    console.log('  Bun performance characteristics:');
    console.log('    - Faster startup time');
    console.log('    - JSC engine (different from V8)');
    console.log('    - Some micro-ops slower (Promise, bind)');
    console.log('    - Overall: excellent performance');
  } else {
    console.log('  Node.js performance characteristics:');
    console.log('    - V8 engine (highly optimized)');
    console.log('    - Mature worker_threads implementation');
    console.log('    - Slightly faster pool creation');
    console.log('    - Overall: excellent performance');
  }

  console.log('\n  Both runtimes are fully supported!');

  console.log('\n' + '='.repeat(50));
  console.log('Bun Compatibility examples completed!');
}

main().catch(console.error);

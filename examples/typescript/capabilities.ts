/**
 * Capabilities Detection Example (TypeScript)
 *
 * Demonstrates the comprehensive runtime capability detection API:
 * - getCapabilities: Get all runtime capabilities
 * - getCachedCapabilities: Cached version for performance
 * - getCapabilityReport: Human-readable capability report
 * - canUseOptimalTransfer: Check for SharedArrayBuffer + Atomics
 * - canUseZeroCopy: Check for any zero-copy transfer method
 * - clearCapabilitiesCache: Clear cached capabilities
 *
 * Use capabilities to:
 * - Choose optimal data transfer strategies
 * - Adapt to runtime environment (Node.js, Bun, browser)
 * - Detect available features before using them
 *
 * Run with: npx tsx examples/typescript/capabilities.ts
 */

import {
  getCapabilities,
  getCachedCapabilities,
  clearCapabilitiesCache,
  canUseOptimalTransfer,
  canUseZeroCopy,
  getCapabilityReport,
  capabilities,
  type Capabilities,
} from '../../dist/ts/full.js';

async function main(): Promise<void> {
  console.log('Capabilities Detection Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Get all capabilities
  // ============================================================
  console.log('\n1. getCapabilities()\n');

  const caps: Capabilities = getCapabilities();

  console.log('  Platform Info:');
  console.log(`    Platform: ${caps.platform}`);
  console.log(`    Is Bun: ${caps.isBun}`);
  console.log(`    Bun Version: ${caps.bunVersion || 'N/A'}`);
  console.log(`    Max Workers: ${caps.maxWorkers}`);
  console.log(`    Memory Limit: ${Math.round(caps.estimatedMemoryLimit / (1024 * 1024))}MB`);

  console.log('\n  Worker Support:');
  console.log(`    Worker Threads: ${caps.workerThreads}`);
  console.log(`    Worker Modules: ${caps.workerModules}`);
  console.log(`    Recommended Type: ${caps.recommendedWorkerType}`);

  console.log('\n  Data Transfer:');
  console.log(`    SharedArrayBuffer: ${caps.sharedArrayBuffer}`);
  console.log(`    Transferable: ${caps.transferable}`);
  console.log(`    Atomics: ${caps.atomics}`);
  console.log(`    Recommended: ${caps.recommendedTransfer}`);

  console.log('\n  Advanced Features:');
  console.log(`    WebAssembly: ${caps.webAssembly}`);
  console.log(`    WASM Threads: ${caps.wasmThreads}`);
  console.log(`    Secure Context: ${caps.secureContext}`);
  console.log(`    Cross-Origin Isolated: ${caps.crossOriginIsolated}`);

  // ============================================================
  // Example 2: Pre-computed capabilities (module-level)
  // ============================================================
  console.log('\n2. Pre-computed capabilities\n');

  console.log('  The `capabilities` export is computed at module load:');
  console.log(`    capabilities.platform: ${capabilities.platform}`);
  console.log(`    capabilities.maxWorkers: ${capabilities.maxWorkers}`);
  console.log(`    capabilities.sharedArrayBuffer: ${capabilities.sharedArrayBuffer}`);

  // ============================================================
  // Example 3: Cached capabilities
  // ============================================================
  console.log('\n3. getCachedCapabilities()\n');

  console.log('  First call computes and caches:');
  const start1 = performance.now();
  const cached1 = getCachedCapabilities();
  const time1 = performance.now() - start1;
  console.log(`    Time: ${time1.toFixed(4)}ms`);

  console.log('  Second call returns cached:');
  const start2 = performance.now();
  const cached2 = getCachedCapabilities();
  const time2 = performance.now() - start2;
  console.log(`    Time: ${time2.toFixed(4)}ms`);

  console.log(`    Same object: ${cached1 === cached2}`);

  // ============================================================
  // Example 4: Clear cache
  // ============================================================
  console.log('\n4. clearCapabilitiesCache()\n');

  clearCapabilitiesCache();
  console.log('  Cache cleared');

  const start3 = performance.now();
  const cached3 = getCachedCapabilities();
  const time3 = performance.now() - start3;
  console.log(`  Next call recomputes: ${time3.toFixed(4)}ms`);
  console.log(`  New object: ${cached1 !== cached3}`);

  // ============================================================
  // Example 5: Optimal transfer check
  // ============================================================
  console.log('\n5. canUseOptimalTransfer()\n');

  const optimal = canUseOptimalTransfer();
  console.log(`  Result: ${optimal}`);

  if (optimal) {
    console.log('  SharedArrayBuffer + Atomics available');
    console.log('  Zero-copy sharing for numerical workloads');
  } else {
    console.log('  SharedArrayBuffer or Atomics not available');
    console.log('  Will use transferable or copy-based transfer');
  }

  // ============================================================
  // Example 6: Zero-copy check
  // ============================================================
  console.log('\n6. canUseZeroCopy()\n');

  const zeroCopy = canUseZeroCopy();
  console.log(`  Result: ${zeroCopy}`);

  if (zeroCopy) {
    console.log('  At least one zero-copy method available:');
    console.log(`    - SharedArrayBuffer: ${caps.sharedArrayBuffer}`);
    console.log(`    - Transferable: ${caps.transferable}`);
  } else {
    console.log('  No zero-copy methods available');
    console.log('  Will use structured clone (copying)');
  }

  // ============================================================
  // Example 7: Human-readable report
  // ============================================================
  console.log('\n7. getCapabilityReport()\n');

  const report = getCapabilityReport();
  console.log(report);

  // ============================================================
  // Example 8: Worker type support matrix
  // ============================================================
  console.log('\n8. Worker type support matrix\n');

  const support = caps.workerTypeSupport;
  console.log('  Worker Type Support:');
  console.log(`    thread:  ${support.thread ? 'YES' : 'NO'}`);
  console.log(`    process: ${support.process ? 'YES' : 'NO'}`);
  console.log(`    web:     ${support.web ? 'YES' : 'NO'}`);
  console.log(`    auto:    ${support.auto ? 'YES' : 'NO'}`);

  // ============================================================
  // Example 9: Adaptive configuration based on capabilities
  // ============================================================
  console.log('\n9. Adaptive configuration pattern\n');

  interface PoolConfig {
    workerType: string;
    transferMethod: string;
    maxWorkers: number;
    useWasm: boolean;
  }

  function createOptimalConfig(): PoolConfig {
    const caps = getCapabilities();

    return {
      workerType: caps.recommendedWorkerType,
      transferMethod: caps.recommendedTransfer,
      maxWorkers: Math.max(caps.maxWorkers - 1, 1),
      useWasm: caps.wasmThreads,
    };
  }

  const config = createOptimalConfig();
  console.log('  Optimal configuration for this environment:');
  console.log(`    Worker type: ${config.workerType}`);
  console.log(`    Transfer method: ${config.transferMethod}`);
  console.log(`    Max workers: ${config.maxWorkers}`);
  console.log(`    Use WASM: ${config.useWasm}`);

  // ============================================================
  // Example 10: Feature detection before use
  // ============================================================
  console.log('\n10. Feature detection pattern\n');

  function processLargeArray(data: Float64Array): void {
    const caps = getCapabilities();

    if (caps.sharedArrayBuffer && caps.atomics) {
      console.log('  Using SharedArrayBuffer for zero-copy sharing');
      // const shared = new SharedArrayBuffer(data.byteLength);
      // const view = new Float64Array(shared);
      // view.set(data);
      // ... send shared to workers
    } else if (caps.transferable) {
      console.log('  Using Transferable for ownership transfer');
      // Transfer ownership to worker (original becomes unusable)
      // worker.postMessage(data, [data.buffer]);
    } else {
      console.log('  Using structured clone (copying data)');
      // Data will be copied to worker
      // worker.postMessage(data);
    }
  }

  const testData = new Float64Array(1000);
  processLargeArray(testData);

  // ============================================================
  // Example 11: Runtime-specific optimization
  // ============================================================
  console.log('\n11. Runtime-specific optimization\n');

  if (caps.isBun) {
    console.log('  Bun runtime detected:');
    console.log('    - Using worker_threads (recommended)');
    console.log('    - Avoiding child_process (IPC issues)');
    console.log('    - Native TypeScript support');
  } else if (caps.platform === 'node') {
    console.log('  Node.js runtime detected:');
    console.log('    - Using auto worker type selection');
    console.log(`    - worker_threads: ${caps.workerThreads ? 'available' : 'fallback to process'}`);
  } else {
    console.log('  Browser environment detected:');
    console.log('    - Using Web Workers');
    console.log(`    - Cross-origin isolated: ${caps.crossOriginIsolated}`);
    console.log(`    - Secure context: ${caps.secureContext}`);
  }

  // ============================================================
  // Example 12: Memory-aware configuration
  // ============================================================
  console.log('\n12. Memory-aware configuration\n');

  const memoryMB = Math.round(caps.estimatedMemoryLimit / (1024 * 1024));
  const memoryGB = (caps.estimatedMemoryLimit / (1024 * 1024 * 1024)).toFixed(2);

  console.log(`  Estimated memory limit: ${memoryMB}MB (${memoryGB}GB)`);

  let recommendedChunkSize: number;
  if (caps.estimatedMemoryLimit > 4 * 1024 * 1024 * 1024) {
    recommendedChunkSize = 100 * 1024 * 1024; // 100MB chunks
    console.log('  High memory: using 100MB chunks');
  } else if (caps.estimatedMemoryLimit > 1 * 1024 * 1024 * 1024) {
    recommendedChunkSize = 50 * 1024 * 1024; // 50MB chunks
    console.log('  Medium memory: using 50MB chunks');
  } else {
    recommendedChunkSize = 10 * 1024 * 1024; // 10MB chunks
    console.log('  Low memory: using 10MB chunks');
  }

  console.log(`  Recommended chunk size: ${recommendedChunkSize / (1024 * 1024)}MB`);

  console.log('\n' + '='.repeat(50));
  console.log('Capabilities Detection examples completed!');
}

main().catch(console.error);

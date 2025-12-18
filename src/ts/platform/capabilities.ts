/**
 * Capabilities Detection API
 *
 * Provides comprehensive runtime capability detection for workerpool.
 * Helps applications choose optimal data transfer strategies and features.
 *
 * @example
 * ```typescript
 * import { capabilities, getCapabilities } from '@danielsimonjr/workerpool'
 *
 * console.log(capabilities)
 * // {
 * //   sharedArrayBuffer: true,
 * //   transferable: true,
 * //   workerModules: true,
 * //   atomics: true,
 * //   crossOriginIsolated: true,
 * //   maxWorkers: 8,
 * //   estimatedMemoryLimit: 2147483648
 * // }
 * ```
 */

import {
  platform,
  cpus,
  hasWorkerThreads,
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  type WorkerType,
} from './environment';
import type { WorkerTypeSupport } from '../types/internal';
import {
  hasWebAssembly,
  hasSharedArrayBuffer,
  hasAtomics,
  hasWASMThreads,
  isSecureContext,
  canUseWasmThreads,
} from '../wasm/feature-detection';

/**
 * Capability information for the current environment
 */
export interface Capabilities {
  /** SharedArrayBuffer is available and usable */
  sharedArrayBuffer: boolean;
  /** Transferable objects are supported (ArrayBuffer transfer) */
  transferable: boolean;
  /** ES module workers are supported */
  workerModules: boolean;
  /** Atomics API is available */
  atomics: boolean;
  /** Cross-origin isolation is enabled (required for SharedArrayBuffer in browsers) */
  crossOriginIsolated: boolean;
  /** Maximum recommended number of workers */
  maxWorkers: number;
  /** Estimated memory limit in bytes (approximate) */
  estimatedMemoryLimit: number;
  /** WebAssembly is available */
  webAssembly: boolean;
  /** WASM with threading support is available */
  wasmThreads: boolean;
  /** Current platform ('node' or 'browser') */
  platform: 'node' | 'browser';
  /** Worker threads are available (Node.js) */
  workerThreads: boolean;
  /** Running in secure context */
  secureContext: boolean;
  /** Best available data transfer method */
  recommendedTransfer: 'shared' | 'transferable' | 'binary' | 'json';
  /** Running in Bun runtime */
  isBun: boolean;
  /** Bun version if running in Bun */
  bunVersion: string | null;
  /** Recommended worker type for optimal performance */
  recommendedWorkerType: WorkerType;
  /** Support matrix for different worker types */
  workerTypeSupport: WorkerTypeSupport;
}

/**
 * Detect if Transferable objects are supported
 */
function hasTransferable(): boolean {
  try {
    if (platform === 'node') {
      // Node.js supports transfer in worker_threads via MessagePort
      return hasWorkerThreads;
    }
    // Browser: check if postMessage supports transfer list
    return typeof ArrayBuffer !== 'undefined' &&
           typeof MessageChannel !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Detect if ES module workers are supported
 */
function hasWorkerModules(): boolean {
  if (platform === 'node') {
    // Node.js worker_threads supports ESM
    return hasWorkerThreads;
  }
  // Browser: check for Worker module type support
  try {
    // Create a minimal module worker to test
    const blob = new Blob([''], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url, { type: 'module' });
    worker.terminate();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect cross-origin isolation status
 */
function isCrossOriginIsolated(): boolean {
  if (platform === 'node') {
    // Node.js doesn't have COOP/COEP restrictions
    return true;
  }
  // Browser: check crossOriginIsolated property
  if (typeof self !== 'undefined' && 'crossOriginIsolated' in self) {
    return (self as WindowOrWorkerGlobalScope & { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  }
  // Fallback: try to create a SharedArrayBuffer
  return hasSharedArrayBuffer();
}

/**
 * Estimate available memory limit
 */
function getEstimatedMemoryLimit(): number {
  if (platform === 'node') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const v8 = require('v8');
      const heapStats = v8.getHeapStatistics();
      return heapStats.heap_size_limit || heapStats.total_available_size || 2 * 1024 * 1024 * 1024;
    } catch {
      // Default to 2GB if v8 stats unavailable
      return 2 * 1024 * 1024 * 1024;
    }
  }
  // Browser: use performance.memory if available (Chrome only)
  if (typeof performance !== 'undefined' &&
      (performance as Performance & { memory?: { jsHeapSizeLimit?: number } }).memory) {
    const memory = (performance as Performance & { memory: { jsHeapSizeLimit: number } }).memory;
    return memory.jsHeapSizeLimit;
  }
  // Default estimate: 2GB for browsers
  return 2 * 1024 * 1024 * 1024;
}

/**
 * Determine the recommended data transfer method
 */
function getRecommendedTransfer(): 'shared' | 'transferable' | 'binary' | 'json' {
  // Priority: SharedArrayBuffer > Transferable > Binary > JSON
  if (hasSharedArrayBuffer() && hasAtomics()) {
    return 'shared';
  }
  if (hasTransferable()) {
    return 'transferable';
  }
  // Binary serialization is always available as a step up from JSON
  return 'binary';
}

/**
 * Get complete capability information for the current environment
 *
 * @returns Capabilities object with all detected features
 */
export function getCapabilities(): Capabilities {
  return {
    sharedArrayBuffer: hasSharedArrayBuffer(),
    transferable: hasTransferable(),
    workerModules: hasWorkerModules(),
    atomics: hasAtomics(),
    crossOriginIsolated: isCrossOriginIsolated(),
    maxWorkers: cpus,
    estimatedMemoryLimit: getEstimatedMemoryLimit(),
    webAssembly: hasWebAssembly(),
    wasmThreads: canUseWasmThreads(),
    platform,
    workerThreads: hasWorkerThreads,
    secureContext: isSecureContext(),
    recommendedTransfer: getRecommendedTransfer(),
    isBun,
    bunVersion,
    recommendedWorkerType,
    workerTypeSupport: getWorkerTypeSupport(),
  };
}

// Cache for capabilities (computed once)
let _capabilitiesCache: Capabilities | null = null;

/**
 * Get cached capabilities (computed on first access)
 *
 * Use this for performance when checking capabilities multiple times.
 * Call clearCapabilitiesCache() if environment may have changed.
 */
export function getCachedCapabilities(): Capabilities {
  if (_capabilitiesCache === null) {
    _capabilitiesCache = getCapabilities();
  }
  return _capabilitiesCache;
}

/**
 * Clear the capabilities cache
 *
 * Useful for testing or when environment may have changed.
 */
export function clearCapabilitiesCache(): void {
  _capabilitiesCache = null;
}

/**
 * Pre-computed capabilities for the current environment
 *
 * This is a convenience export for quick access to capabilities.
 * Note: This is computed at module load time.
 */
export const capabilities: Capabilities = getCapabilities();

/**
 * Check if optimal numerical computing features are available
 *
 * Returns true if SharedArrayBuffer + Atomics are available,
 * which enables zero-copy data sharing for numerical workloads.
 */
export function canUseOptimalTransfer(): boolean {
  return hasSharedArrayBuffer() && hasAtomics();
}

/**
 * Check if any form of zero-copy transfer is available
 */
export function canUseZeroCopy(): boolean {
  return hasSharedArrayBuffer() || hasTransferable();
}

/**
 * Get a human-readable capability report
 */
export function getCapabilityReport(): string {
  const caps = getCapabilities();
  const lines: string[] = [
    '=== Workerpool Capabilities Report ===',
    `Platform: ${caps.platform}`,
    `Runtime: ${caps.isBun ? `Bun ${caps.bunVersion}` : 'Node.js'}`,
    `Max Workers: ${caps.maxWorkers}`,
    `Estimated Memory: ${Math.round(caps.estimatedMemoryLimit / (1024 * 1024))}MB`,
    '',
    '--- Worker Types ---',
    `Recommended: ${caps.recommendedWorkerType}`,
    `Thread Support: ${caps.workerTypeSupport.thread ? 'YES' : 'NO'}`,
    `Process Support: ${caps.workerTypeSupport.process ? 'YES' : 'NO (Bun limitation)'}`,
    `Web Support: ${caps.workerTypeSupport.web ? 'YES' : 'NO'}`,
    '',
    '--- Data Transfer ---',
    `SharedArrayBuffer: ${caps.sharedArrayBuffer ? 'YES' : 'NO'}`,
    `Transferable: ${caps.transferable ? 'YES' : 'NO'}`,
    `Atomics: ${caps.atomics ? 'YES' : 'NO'}`,
    `Recommended Transfer: ${caps.recommendedTransfer}`,
    '',
    '--- Advanced Features ---',
    `WebAssembly: ${caps.webAssembly ? 'YES' : 'NO'}`,
    `WASM Threads: ${caps.wasmThreads ? 'YES' : 'NO'}`,
    `Worker Modules: ${caps.workerModules ? 'YES' : 'NO'}`,
    `Worker Threads (Node): ${caps.workerThreads ? 'YES' : 'NO'}`,
    '',
    '--- Security ---',
    `Secure Context: ${caps.secureContext ? 'YES' : 'NO'}`,
    `Cross-Origin Isolated: ${caps.crossOriginIsolated ? 'YES' : 'NO'}`,
    '======================================',
  ];
  return lines.join('\n');
}

export default {
  capabilities,
  getCapabilities,
  getCachedCapabilities,
  clearCapabilitiesCache,
  canUseOptimalTransfer,
  canUseZeroCopy,
  getCapabilityReport,
};

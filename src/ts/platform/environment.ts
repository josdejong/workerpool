/**
 * Platform detection utilities for workerpool
 * Detects runtime environment (Node.js vs browser) and available features
 * Includes Bun runtime detection for optimal configuration
 */

import type { PlatformInfo, WorkerTypeSupport } from '../types/internal';

/**
 * Check if running in Node.js environment
 * @param nodeProcess - The process object to check
 * @returns True if running in Node.js
 */
export function isNode(nodeProcess?: unknown): boolean {
  return (
    typeof nodeProcess !== 'undefined' &&
    nodeProcess !== null &&
    typeof (nodeProcess as NodeJS.Process).versions === 'object' &&
    (nodeProcess as NodeJS.Process).versions !== null &&
    typeof (nodeProcess as NodeJS.Process).versions.node === 'string' &&
    String(nodeProcess) === '[object process]'
  );
}

/**
 * Current platform: 'node' or 'browser'
 */
export const platform: 'node' | 'browser' =
  typeof process !== 'undefined' && isNode(process) ? 'node' : 'browser';

/**
 * Check if running in Bun runtime
 * Bun sets process.versions.bun to indicate it's the runtime
 */
export const isBun: boolean =
  typeof process !== 'undefined' &&
  process.versions !== undefined &&
  typeof (process.versions as Record<string, string>).bun === 'string';

/**
 * Bun version if running in Bun, null otherwise
 */
export const bunVersion: string | null = isBun
  ? (process.versions as Record<string, string>).bun
  : null;

/**
 * Check if worker_threads module is available
 */
function getWorkerThreads(): typeof import('worker_threads') | null {
  if (platform !== 'node') {
    return null;
  }
  try {
    // Dynamic require to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('worker_threads');
  } catch {
    return null;
  }
}

const workerThreadsModule = getWorkerThreads();

/**
 * Whether running in the main thread
 * - In Node.js: not in worker_thread AND not a forked child process
 * - In browser: check if Window is defined (not in Web Worker)
 */
export const isMainThread: boolean =
  platform === 'node'
    ? (!workerThreadsModule || workerThreadsModule.isMainThread) && !process.connected
    : typeof Window !== 'undefined';

/**
 * Number of available CPU cores
 * - In Node.js: from os.cpus()
 * - In browser: from navigator.hardwareConcurrency
 */
export const cpus: number = (() => {
  if (platform === 'browser') {
    // Browser environment
    return typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4; // Default fallback
  }
  // Node.js environment
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os');
    return os.cpus().length;
  } catch {
    return 4; // Default fallback
  }
})();

/**
 * Whether worker_threads is available (Node.js 11.7.0+)
 */
export const hasWorkerThreads: boolean = workerThreadsModule !== null;

/**
 * Whether SharedArrayBuffer is available
 * Note: In browsers, requires Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 */
export const hasSharedArrayBuffer: boolean = typeof SharedArrayBuffer !== 'undefined';

/**
 * Whether Atomics is available
 */
export const hasAtomics: boolean = typeof Atomics !== 'undefined';

/**
 * Worker type options
 */
export type WorkerType = 'auto' | 'thread' | 'process' | 'web';

/**
 * Recommended worker type for the current runtime
 * - In Bun: 'thread' is recommended (child_process.fork has IPC issues)
 * - In Node.js: 'auto' (will choose thread or process based on availability)
 * - In browser: 'web'
 */
export const recommendedWorkerType: WorkerType = (() => {
  if (platform === 'browser') {
    return 'web';
  }
  // Bun has issues with child_process.fork IPC, prefer thread
  if (isBun) {
    return 'thread';
  }
  return 'auto';
})();

/**
 * Get worker type support matrix for current environment
 */
export function getWorkerTypeSupport(): WorkerTypeSupport {
  return {
    thread: platform === 'node' && hasWorkerThreads,
    process: platform === 'node' && !isBun, // Limited support in Bun
    web: platform === 'browser',
    auto: true,
  };
}

/**
 * Check if a specific worker type is fully supported
 * @param workerType - The worker type to check
 */
export function isWorkerTypeSupported(workerType: WorkerType): boolean {
  const support = getWorkerTypeSupport();
  return support[workerType];
}

/**
 * Get complete platform information
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    platform,
    isMainThread,
    cpus,
    hasWorkerThreads,
    hasSharedArrayBuffer,
    hasAtomics,
    isBun,
    bunVersion,
    recommendedWorkerType,
    workerTypeSupport: getWorkerTypeSupport(),
  };
}

/**
 * Default export for backward compatibility with CommonJS
 */
export default {
  isNode,
  platform,
  isMainThread,
  cpus,
  hasWorkerThreads,
  hasSharedArrayBuffer,
  hasAtomics,
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
  getPlatformInfo,
};

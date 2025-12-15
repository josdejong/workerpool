/**
 * Worker URL Resolution Utilities
 *
 * Provides cross-platform URL resolution for worker scripts,
 * handling differences between Node.js and browser environments,
 * as well as various bundler configurations.
 *
 * @example
 * ```typescript
 * import { resolveWorkerUrl } from '@danielsimonjr/workerpool'
 *
 * const workerUrl = resolveWorkerUrl('./worker.js', import.meta.url)
 * const pool = workerpool.pool(workerUrl)
 * ```
 */

import { platform } from './environment';

/**
 * Resolve a worker script URL relative to a base URL
 *
 * Works consistently across:
 * - Node.js (ESM and CommonJS)
 * - Browser (ESM modules)
 * - Various bundlers (Webpack, Rollup, Vite, esbuild)
 *
 * @param workerPath - Relative path to the worker script
 * @param baseUrl - Base URL (typically import.meta.url or __dirname)
 * @returns Resolved URL string suitable for worker creation
 *
 * @example
 * ```typescript
 * // ESM in browser or Node.js
 * const url = resolveWorkerUrl('./matrix.worker.js', import.meta.url)
 *
 * // CommonJS in Node.js
 * const url = resolveWorkerUrl('./matrix.worker.js', __dirname)
 * ```
 */
export function resolveWorkerUrl(workerPath: string, baseUrl?: string): string {
  // If workerPath is already an absolute URL, return it
  if (isAbsoluteUrl(workerPath)) {
    return workerPath;
  }

  // If workerPath is already an absolute file path, return it
  if (isAbsoluteFilePath(workerPath)) {
    return workerPath;
  }

  // If no base URL provided, return the relative path as-is
  if (!baseUrl) {
    return workerPath;
  }

  if (platform === 'node') {
    return resolveNodeUrl(workerPath, baseUrl);
  } else {
    return resolveBrowserUrl(workerPath, baseUrl);
  }
}

/**
 * Check if a string is an absolute URL
 */
function isAbsoluteUrl(url: string): boolean {
  return /^(https?|file|blob|data):\/\//i.test(url) || url.startsWith('blob:');
}

/**
 * Check if a string is an absolute file path
 */
function isAbsoluteFilePath(path: string): boolean {
  // Unix absolute path
  if (path.startsWith('/')) {
    return true;
  }
  // Windows absolute path (C:\ or C:/)
  if (/^[A-Za-z]:[/\\]/.test(path)) {
    return true;
  }
  return false;
}

/**
 * Resolve URL in Node.js environment
 */
function resolveNodeUrl(workerPath: string, baseUrl: string): string {
  // Handle file:// URLs (from import.meta.url)
  if (baseUrl.startsWith('file://')) {
    try {
      const url = new URL(workerPath, baseUrl);
      return url.href;
    } catch {
      // Fall back to path resolution
    }
  }

  // Handle __dirname style paths
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    return path.resolve(baseUrl, workerPath);
  } catch {
    // If path module not available, just concatenate
    return joinPaths(baseUrl, workerPath);
  }
}

/**
 * Resolve URL in browser environment
 */
function resolveBrowserUrl(workerPath: string, baseUrl: string): string {
  try {
    const url = new URL(workerPath, baseUrl);
    return url.href;
  } catch {
    // Fall back to simple concatenation
    return joinPaths(baseUrl, workerPath);
  }
}

/**
 * Simple path joining for fallback
 */
function joinPaths(base: string, relative: string): string {
  // Remove trailing slash from base
  const cleanBase = base.replace(/\/+$/, '');
  // Remove leading ./ from relative
  const cleanRelative = relative.replace(/^\.\//, '');

  // Handle ../ in relative path
  if (cleanRelative.startsWith('../')) {
    const parts = cleanBase.split('/');
    let relativeParts = cleanRelative.split('/');

    while (relativeParts[0] === '..') {
      parts.pop();
      relativeParts = relativeParts.slice(1);
    }

    return parts.join('/') + '/' + relativeParts.join('/');
  }

  return cleanBase + '/' + cleanRelative;
}

/**
 * Create a blob URL from inline worker code
 *
 * Useful for bundler-friendly inline workers.
 *
 * @param code - JavaScript code for the worker
 * @param options - Worker blob options
 * @returns Blob URL for the worker
 *
 * @example
 * ```typescript
 * const workerCode = `
 *   import workerpool from 'workerpool';
 *   workerpool.worker({
 *     heavy: (n) => fibonacci(n)
 *   });
 * `;
 * const url = createWorkerBlobUrl(workerCode, { type: 'module' });
 * const pool = workerpool.pool(url);
 * ```
 */
export function createWorkerBlobUrl(
  code: string,
  options?: { type?: 'classic' | 'module' }
): string {
  if (platform !== 'browser') {
    throw new Error('createWorkerBlobUrl is only supported in browser environments');
  }

  const blob = new Blob([code], {
    type: options?.type === 'module'
      ? 'application/javascript'
      : 'text/javascript',
  });

  return URL.createObjectURL(blob);
}

/**
 * Revoke a blob URL created by createWorkerBlobUrl
 *
 * Call this when the worker is no longer needed to free memory.
 *
 * @param url - Blob URL to revoke
 */
export function revokeWorkerBlobUrl(url: string): void {
  if (platform === 'browser' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Get the current module URL
 *
 * Works in both ESM (import.meta.url) and CommonJS (__filename) contexts.
 *
 * @returns Current module URL or undefined if not available
 */
export function getCurrentModuleUrl(): string | undefined {
  // Browser or Node ESM - use Function constructor to avoid static analysis
  try {
    // Dynamically check for import.meta.url at runtime
    // This avoids TypeScript errors in non-ESM configurations
    const getMetaUrl = new Function('return typeof import.meta !== "undefined" ? import.meta.url : undefined');
    const metaUrl = getMetaUrl();
    if (metaUrl) {
      return metaUrl;
    }
  } catch {
    // import.meta not available in this context
  }

  // Node CommonJS
  if (platform === 'node') {
    try {
      // __filename is available in CommonJS
      if (typeof __filename !== 'undefined') {
        return `file://${__filename}`;
      }
    } catch {
      // __filename not available in ESM
    }
  }

  return undefined;
}

/**
 * Create a data URL from worker code
 *
 * Alternative to blob URLs that works in more environments.
 *
 * @param code - JavaScript code for the worker
 * @returns Data URL for the worker
 */
export function createWorkerDataUrl(code: string): string {
  const encoded = encodeURIComponent(code);
  return `data:text/javascript;charset=utf-8,${encoded}`;
}

/**
 * Check if worker module type is supported
 *
 * Module workers (type: 'module') allow using import/export in workers.
 *
 * @returns true if module workers are supported
 */
export function supportsWorkerModules(): boolean {
  if (platform !== 'browser') {
    // Node.js worker_threads always support ESM
    return true;
  }

  try {
    // Try to create a module worker
    const blob = new Blob([''], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    try {
      const worker = new Worker(url, { type: 'module' });
      worker.terminate();
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return false;
  }
}

/**
 * Worker script configuration helper
 *
 * Provides bundler-friendly worker configuration.
 *
 * @example
 * ```typescript
 * const config = getWorkerConfig({
 *   script: './worker.js',
 *   baseUrl: import.meta.url,
 *   inline: false,
 *   type: 'module'
 * });
 *
 * const pool = workerpool.pool(config.url, {
 *   workerOpts: config.workerOpts
 * });
 * ```
 */
export interface WorkerConfig {
  /** Resolved worker URL */
  url: string;
  /** Worker options to pass to pool */
  workerOpts: {
    type?: 'classic' | 'module';
  };
}

export interface WorkerConfigOptions {
  /** Worker script path */
  script: string;
  /** Base URL for resolution */
  baseUrl?: string;
  /** Use module worker type */
  type?: 'classic' | 'module';
  /** Inline worker code (instead of script) */
  inlineCode?: string;
}

/**
 * Get worker configuration with resolved URL and options
 */
export function getWorkerConfig(options: WorkerConfigOptions): WorkerConfig {
  let url: string;

  if (options.inlineCode) {
    if (platform === 'browser') {
      url = createWorkerBlobUrl(options.inlineCode, { type: options.type });
    } else {
      // Node.js: use data URL
      url = createWorkerDataUrl(options.inlineCode);
    }
  } else {
    url = resolveWorkerUrl(options.script, options.baseUrl);
  }

  return {
    url,
    workerOpts: {
      type: options.type,
    },
  };
}

export default {
  resolveWorkerUrl,
  createWorkerBlobUrl,
  revokeWorkerBlobUrl,
  getCurrentModuleUrl,
  createWorkerDataUrl,
  supportsWorkerModules,
  getWorkerConfig,
};

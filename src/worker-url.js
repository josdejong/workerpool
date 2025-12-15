/**
 * Worker URL Utilities
 *
 * Utilities for resolving and managing worker URLs across different environments.
 */

var environment = require('./environment');

// ============================================================================
// Worker URL Resolution
// ============================================================================

/**
 * Resolve a worker URL for use in bundlers
 * @param {string|URL} url - The worker URL to resolve
 * @param {object} [options] - Resolution options
 * @param {string} [options.type] - Worker type ('classic' or 'module')
 * @returns {string} Resolved URL
 */
function resolveWorkerUrl(url, options) {
  var urlString = url instanceof URL ? url.href : String(url);

  if (environment.platform === 'node') {
    // Node.js: resolve to absolute path
    try {
      var path = require('path');
      if (!path.isAbsolute(urlString) && !urlString.startsWith('file://')) {
        return path.resolve(process.cwd(), urlString);
      }
    } catch (e) {
      // Fallback to original URL
    }
  }

  return urlString;
}

/**
 * Create a blob URL from worker code
 * @param {string} code - JavaScript code for the worker
 * @param {object} [options] - Creation options
 * @param {string} [options.type] - Worker type ('classic' or 'module')
 * @returns {string} Blob URL
 */
function createWorkerBlobUrl(code, options) {
  if (environment.platform === 'node') {
    throw new Error('Blob URLs are not supported in Node.js');
  }

  var type = options && options.type === 'module' ? 'application/javascript' : 'text/javascript';
  var blob = new Blob([code], { type: type });
  return URL.createObjectURL(blob);
}

/**
 * Revoke a blob URL
 * @param {string} url - The blob URL to revoke
 */
function revokeWorkerBlobUrl(url) {
  if (environment.platform !== 'node' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Get worker configuration based on environment
 * @param {string} url - Worker URL
 * @param {object} [options] - Configuration options
 * @returns {object} Worker configuration
 */
function getWorkerConfig(url, options) {
  var config = {
    url: resolveWorkerUrl(url),
    type: options && options.type || 'classic',
    credentials: options && options.credentials || 'same-origin',
  };

  if (environment.platform === 'browser') {
    config.name = options && options.name || undefined;
  }

  return config;
}

/**
 * Check if module workers are supported
 * @returns {boolean}
 */
function supportsWorkerModules() {
  if (environment.platform === 'node') {
    return environment.hasWorkerThreads;
  }

  try {
    var blob = new Blob([''], { type: 'application/javascript' });
    var url = URL.createObjectURL(blob);
    var worker = new Worker(url, { type: 'module' });
    worker.terminate();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get the current module URL (for relative imports)
 * @returns {string|undefined}
 */
function getCurrentModuleUrl() {
  try {
    // Try to get import.meta.url dynamically
    var getUrl = new Function('return typeof import.meta !== "undefined" ? import.meta.url : undefined');
    return getUrl();
  } catch (e) {
    return undefined;
  }
}

// ============================================================================
// Exports
// ============================================================================

exports.resolveWorkerUrl = resolveWorkerUrl;
exports.createWorkerBlobUrl = createWorkerBlobUrl;
exports.revokeWorkerBlobUrl = revokeWorkerBlobUrl;
exports.getWorkerConfig = getWorkerConfig;
exports.supportsWorkerModules = supportsWorkerModules;
exports.getCurrentModuleUrl = getCurrentModuleUrl;

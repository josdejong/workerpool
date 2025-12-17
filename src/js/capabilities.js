/**
 * Capabilities Detection API
 *
 * Provides runtime capability detection for workerpool.
 * Helps applications choose optimal data transfer strategies.
 */

var environment = require('./environment');

// ============================================================================
// Feature Detection Functions
// ============================================================================

/**
 * Check if WebAssembly is available
 * @returns {boolean}
 */
function hasWebAssembly() {
  return typeof WebAssembly !== 'undefined' &&
         typeof WebAssembly.instantiate === 'function';
}

/**
 * Check if SharedArrayBuffer is available and usable
 * @returns {boolean}
 */
function hasSharedArrayBuffer() {
  try {
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }
    var buffer = new SharedArrayBuffer(1);
    return buffer.byteLength === 1;
  } catch (e) {
    return false;
  }
}

/**
 * Check if Atomics API is available
 * @returns {boolean}
 */
function hasAtomics() {
  return typeof Atomics !== 'undefined' &&
         typeof Atomics.load === 'function' &&
         typeof Atomics.store === 'function' &&
         typeof Atomics.compareExchange === 'function';
}

/**
 * Check if Transferable objects are supported
 * @returns {boolean}
 */
function hasTransferable() {
  try {
    if (environment.platform === 'node') {
      return environment.hasWorkerThreads;
    }
    return typeof ArrayBuffer !== 'undefined' &&
           typeof MessageChannel !== 'undefined';
  } catch (e) {
    return false;
  }
}

/**
 * Check if ES module workers are supported
 * @returns {boolean}
 */
function hasWorkerModules() {
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
 * Detect cross-origin isolation status
 * @returns {boolean}
 */
function isCrossOriginIsolated() {
  if (environment.platform === 'node') {
    return true;
  }
  if (typeof self !== 'undefined' && 'crossOriginIsolated' in self) {
    return self.crossOriginIsolated === true;
  }
  return hasSharedArrayBuffer();
}

/**
 * Estimate available memory limit
 * @returns {number}
 */
function getEstimatedMemoryLimit() {
  if (environment.platform === 'node') {
    try {
      var v8 = require('v8');
      var heapStats = v8.getHeapStatistics();
      return heapStats.heap_size_limit || heapStats.total_available_size || 2 * 1024 * 1024 * 1024;
    } catch (e) {
      return 2 * 1024 * 1024 * 1024;
    }
  }
  if (typeof performance !== 'undefined' && performance.memory) {
    return performance.memory.jsHeapSizeLimit;
  }
  return 2 * 1024 * 1024 * 1024;
}

/**
 * Determine the recommended data transfer method
 * @returns {'shared'|'transferable'|'binary'|'json'}
 */
function getRecommendedTransfer() {
  if (hasSharedArrayBuffer() && hasAtomics()) {
    return 'shared';
  }
  if (hasTransferable()) {
    return 'transferable';
  }
  return 'binary';
}

/**
 * Check if WASM with threading is available
 * @returns {boolean}
 */
function hasWASMThreads() {
  if (!hasWebAssembly()) {
    return false;
  }
  try {
    var memory = new WebAssembly.Memory({
      initial: 1,
      maximum: 1,
      shared: true,
    });
    return memory.buffer instanceof SharedArrayBuffer;
  } catch (e) {
    return false;
  }
}

/**
 * Check if running in secure context
 * @returns {boolean}
 */
function isSecureContext() {
  if (typeof self !== 'undefined' && 'isSecureContext' in self) {
    return self.isSecureContext;
  }
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return true;
  }
  return false;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get complete capability information for the current environment
 * @returns {object}
 */
function getCapabilities() {
  return {
    sharedArrayBuffer: hasSharedArrayBuffer(),
    transferable: hasTransferable(),
    workerModules: hasWorkerModules(),
    atomics: hasAtomics(),
    crossOriginIsolated: isCrossOriginIsolated(),
    maxWorkers: environment.cpus,
    estimatedMemoryLimit: getEstimatedMemoryLimit(),
    webAssembly: hasWebAssembly(),
    wasmThreads: hasWASMThreads(),
    platform: environment.platform,
    workerThreads: environment.hasWorkerThreads,
    secureContext: isSecureContext(),
    recommendedTransfer: getRecommendedTransfer(),
  };
}

// Cached capabilities
var _capabilitiesCache = null;

/**
 * Get cached capabilities
 * @returns {object}
 */
function getCachedCapabilities() {
  if (_capabilitiesCache === null) {
    _capabilitiesCache = getCapabilities();
  }
  return _capabilitiesCache;
}

/**
 * Check if optimal numerical computing features are available
 * @returns {boolean}
 */
function canUseOptimalTransfer() {
  return hasSharedArrayBuffer() && hasAtomics();
}

/**
 * Check if any form of zero-copy transfer is available
 * @returns {boolean}
 */
function canUseZeroCopy() {
  return hasSharedArrayBuffer() || hasTransferable();
}

/**
 * Get a human-readable capability report
 * @returns {string}
 */
function getCapabilityReport() {
  var caps = getCapabilities();
  var lines = [
    '=== Workerpool Capabilities Report ===',
    'Platform: ' + caps.platform,
    'Max Workers: ' + caps.maxWorkers,
    'Estimated Memory: ' + Math.round(caps.estimatedMemoryLimit / (1024 * 1024)) + 'MB',
    '',
    '--- Data Transfer ---',
    'SharedArrayBuffer: ' + (caps.sharedArrayBuffer ? 'YES' : 'NO'),
    'Transferable: ' + (caps.transferable ? 'YES' : 'NO'),
    'Atomics: ' + (caps.atomics ? 'YES' : 'NO'),
    'Recommended Transfer: ' + caps.recommendedTransfer,
    '',
    '--- Advanced Features ---',
    'WebAssembly: ' + (caps.webAssembly ? 'YES' : 'NO'),
    'WASM Threads: ' + (caps.wasmThreads ? 'YES' : 'NO'),
    'Worker Modules: ' + (caps.workerModules ? 'YES' : 'NO'),
    'Worker Threads (Node): ' + (caps.workerThreads ? 'YES' : 'NO'),
    '',
    '--- Security ---',
    'Secure Context: ' + (caps.secureContext ? 'YES' : 'NO'),
    'Cross-Origin Isolated: ' + (caps.crossOriginIsolated ? 'YES' : 'NO'),
    '======================================',
  ];
  return lines.join('\n');
}

// Pre-computed capabilities
var capabilities = getCapabilities();

// ============================================================================
// Exports
// ============================================================================

exports.capabilities = capabilities;
exports.getCapabilities = getCapabilities;
exports.getCachedCapabilities = getCachedCapabilities;
exports.canUseOptimalTransfer = canUseOptimalTransfer;
exports.canUseZeroCopy = canUseZeroCopy;
exports.getCapabilityReport = getCapabilityReport;
exports.hasSharedArrayBuffer = hasSharedArrayBuffer;
exports.hasTransferable = hasTransferable;
exports.hasAtomics = hasAtomics;
exports.hasWebAssembly = hasWebAssembly;
exports.hasWASMThreads = hasWASMThreads;

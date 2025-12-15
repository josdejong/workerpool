const {platform, isMainThread, cpus} = require('./environment');
const {TerminateError} = require('./WorkerHandler');

/** @typedef {import("./Pool")} Pool */
/** @typedef {import("./types.js").WorkerPoolOptions} WorkerPoolOptions */
/** @typedef {import("./types.js").WorkerRegisterOptions} WorkerRegisterOptions */

/**
 * @template { { [k: string]: (...args: any[]) => any } } T
 * @typedef {import('./types.js').Proxy<T>} Proxy<T>
 */

/**
 * @overload
 * Create a new worker pool
 * @param {WorkerPoolOptions} [script]
 * @returns {Pool} pool
 */
/**
 * @overload
 * Create a new worker pool
 * @param {string} [script]
 * @param {WorkerPoolOptions} [options]
 * @returns {Pool} pool
 */
function pool(script, options) {
  var Pool = require('./Pool');

  return new Pool(script, options);
};
exports.pool = pool;

/**
 * Create a worker and optionally register a set of methods to the worker.
 * @param {{ [k: string]: (...args: any[]) => any }} [methods]
 * @param {WorkerRegisterOptions} [options]
 */
function worker(methods, options) {
  var worker = require('./worker');
  worker.add(methods, options);
};
exports.worker = worker;

/**
 * Sends an event to the parent worker pool.
 * @param {any} payload
 */
function workerEmit(payload) {
  var worker = require('./worker');
  worker.emit(payload);
};
exports.workerEmit = workerEmit;

const {Promise} = require('./Promise');
exports.Promise = Promise;

exports.Transfer = require('./transfer');

exports.platform = platform;
exports.isMainThread = isMainThread;
exports.cpus = cpus;
exports.TerminateError = TerminateError;

// ============================================================================
// New features from WORKERPOOL_IMPROVEMENTS.md
// These features are bundled via rollup from TypeScript source files.
// ============================================================================

// Enhanced Pool with advanced features (Issue 2.1, 2.2, 5.2, 6.1, 6.2, 7.1)
var {
  PoolEnhanced,
  getSharedPool,
  terminateSharedPool,
  hasSharedPool
} = require('./PoolEnhanced');

exports.PoolEnhanced = PoolEnhanced;
exports.getSharedPool = getSharedPool;
exports.terminateSharedPool = terminateSharedPool;
exports.hasSharedPool = hasSharedPool;
exports.enhancedPool = function(script, options) {
  return new PoolEnhanced(script, options);
};

// Capabilities API (Issue 8.1)
var {
  capabilities,
  getCapabilities,
  canUseOptimalTransfer,
  canUseZeroCopy,
  getCapabilityReport
} = require('./capabilities');

exports.capabilities = capabilities;
exports.getCapabilities = getCapabilities;
exports.canUseOptimalTransfer = canUseOptimalTransfer;
exports.canUseZeroCopy = canUseZeroCopy;
exports.getCapabilityReport = getCapabilityReport;

// Worker URL utilities (Issue 4.2)
var {
  resolveWorkerUrl,
  createWorkerBlobUrl,
  revokeWorkerBlobUrl,
  getWorkerConfig,
  supportsWorkerModules
} = require('./worker-url');

exports.resolveWorkerUrl = resolveWorkerUrl;
exports.createWorkerBlobUrl = createWorkerBlobUrl;
exports.revokeWorkerBlobUrl = revokeWorkerBlobUrl;
exports.getWorkerConfig = getWorkerConfig;
exports.supportsWorkerModules = supportsWorkerModules;

// Binary serialization (Issue 1.3)
var {
  serializeBinary,
  deserializeBinary,
  shouldUseBinarySerialization,
  estimateBinarySize
} = require('./binary-serializer');

exports.serializeBinary = serializeBinary;
exports.deserializeBinary = deserializeBinary;
exports.shouldUseBinarySerialization = shouldUseBinarySerialization;
exports.estimateBinarySize = estimateBinarySize;
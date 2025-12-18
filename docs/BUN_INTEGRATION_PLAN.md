# Bun Integration Plan for Workerpool

This document outlines the technical details and proposed solutions for achieving full Bun compatibility.

## Current State Analysis

### What Works ✅

1. **Worker Threads API**
   - `worker_threads.Worker` creation
   - `parentPort.postMessage()` / `worker.postMessage()`
   - `parentPort.on('message')` / `worker.on('message')`
   - Transferable objects
   - SharedArrayBuffer sharing

2. **Core Library Features**
   - Pool management
   - Task queuing (FIFO, LIFO)
   - Promise handling with cancellation/timeout
   - Proxy pattern
   - Method registration

3. **TypeScript Build**
   - All 513 unit tests pass
   - Type definitions work correctly
   - Modern/minimal/full entry points

4. **WASM Features**
   - WebAssembly compilation and execution
   - SharedArrayBuffer for threading
   - Atomics for synchronization
   - AssemblyScript modules

### What Has Issues ⚠️

1. **child_process.fork() IPC**
   - Process spawning works
   - Basic IPC works in isolation
   - Complex message handling in worker.js times out
   - Root cause: Likely timing/buffering differences in Bun's IPC

## Proposed Solutions

### Solution 1: Bun Runtime Detection (Recommended)

Add explicit Bun detection to prefer worker_threads:

```javascript
// src/js/environment.js

// Check if running in Bun
module.exports.isBun = typeof process !== 'undefined' &&
  process.versions &&
  process.versions.bun !== undefined;

// Recommended worker type for the platform
module.exports.recommendedWorkerType = module.exports.isBun ? 'thread' : 'auto';
```

Update WorkerHandler to use this:

```javascript
// src/js/WorkerHandler.js

function getEffectiveWorkerType(options) {
  if (options.workerType && options.workerType !== 'auto') {
    return options.workerType;
  }

  // In Bun, prefer thread over process
  if (environment.isBun) {
    return 'thread';
  }

  // Default auto behavior
  return 'auto';
}
```

### Solution 2: Warn on Unsupported Configuration

Add runtime warnings for problematic configurations:

```javascript
// src/js/Pool.js

function Pool(script, options) {
  // ... existing code ...

  if (environment.isBun && this.workerType === 'process') {
    console.warn(
      '[workerpool] Warning: workerType "process" may have issues in Bun. ' +
      'Consider using "thread" for best compatibility.'
    );
  }
}
```

### Solution 3: Environment Capability Detection

Enhance capability detection for Bun-specific features:

```javascript
// src/js/capabilities.js

function getCapabilities() {
  return {
    // ... existing capabilities ...

    // Bun-specific
    isBun: environment.isBun,
    bunVersion: process?.versions?.bun,

    // Worker type recommendations
    recommendedWorkerType: environment.recommendedWorkerType,

    // Feature support matrix
    workerTypeSupport: {
      thread: true,
      process: !environment.isBun, // Limited in Bun
      web: environment.platform === 'browser',
      auto: true
    }
  };
}
```

### Solution 4: TypeScript Environment Module Updates

Update the TypeScript environment module:

```typescript
// src/ts/platform/environment.ts

/**
 * Check if running in Bun runtime
 */
export const isBun: boolean =
  typeof process !== 'undefined' &&
  process.versions !== undefined &&
  'bun' in process.versions;

/**
 * Bun version if running in Bun, null otherwise
 */
export const bunVersion: string | null = isBun
  ? (process.versions as Record<string, string>).bun
  : null;

/**
 * Recommended worker type for current runtime
 */
export const recommendedWorkerType: 'thread' | 'process' | 'auto' =
  isBun ? 'thread' : 'auto';

/**
 * Get complete platform information
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    // ... existing properties ...
    isBun,
    bunVersion,
    recommendedWorkerType,
  };
}
```

### Solution 5: Pool Configuration Helper

Add a helper for optimal pool configuration:

```javascript
// src/js/index.js

/**
 * Create a pool with optimal settings for the current runtime
 */
workerpool.createOptimalPool = function(script, options) {
  const defaultOptions = {
    workerType: environment.recommendedWorkerType,
    maxWorkers: Math.max((environment.cpus || 4) - 1, 1)
  };

  return new Pool(script, Object.assign({}, defaultOptions, options));
};

// Usage:
// const pool = workerpool.createOptimalPool('./worker.js');
```

## Implementation Phases

### Phase 1: Detection & Warnings (Low Risk)

1. Add `isBun` and `bunVersion` to environment detection
2. Add console warnings for problematic configurations
3. Update documentation

**Files to modify:**
- `src/js/environment.js`
- `src/ts/platform/environment.ts`
- `src/js/Pool.js`

**Estimated effort:** 1-2 hours

### Phase 2: Default Behavior Changes (Medium Risk)

1. Change default worker type selection to prefer threads in Bun
2. Add `recommendedWorkerType` export
3. Update capabilities module

**Files to modify:**
- `src/js/WorkerHandler.js`
- `src/ts/core/WorkerHandler.ts`
- `src/js/capabilities.js`

**Estimated effort:** 2-4 hours

### Phase 3: API Additions (Low Risk)

1. Add `createOptimalPool` helper
2. Add Bun-specific configuration options
3. Export new utilities

**Files to modify:**
- `src/js/index.js`
- `src/ts/index.ts`

**Estimated effort:** 1-2 hours

### Phase 4: Testing Infrastructure

1. Add Bun to CI matrix
2. Create Bun-specific test suite
3. Add integration tests

**Files to add:**
- `.github/workflows/bun-tests.yml`
- `test/bun/`

**Estimated effort:** 4-6 hours

## Configuration Reference

### Optimal Bun Configuration

```javascript
const workerpool = require('workerpool');

const pool = workerpool.pool({
  // Required for Bun compatibility
  workerType: 'thread',

  // Recommended settings
  maxWorkers: require('os').cpus().length - 1,
  minWorkers: 2,

  // Optional performance tuning
  workerTerminateTimeout: 1000,
  maxQueueSize: 1000,
});
```

### Configuration Matrix

| Option | Node.js | Bun | Browser |
|--------|---------|-----|---------|
| `workerType: 'auto'` | ✅ thread/process | ✅ thread | ✅ web |
| `workerType: 'thread'` | ✅ | ✅ | ❌ |
| `workerType: 'process'` | ✅ | ⚠️ | ❌ |
| `workerType: 'web'` | ❌ | ❌ | ✅ |

## Monitoring & Maintenance

### GitHub Issues to Track

- [Bun child_process.fork issues](https://github.com/oven-sh/bun/issues?q=child_process+fork)
- [Bun worker_threads issues](https://github.com/oven-sh/bun/issues?q=worker_threads)

### Testing Checklist

- [ ] Worker thread creation and messaging
- [ ] Pool task execution
- [ ] Task cancellation and timeout
- [ ] Parallel task execution
- [ ] Worker termination and cleanup
- [ ] Dedicated worker scripts
- [ ] Transferable objects
- [ ] WASM features (if using /full)

## Appendix: Test Scripts

### Basic Compatibility Test

```javascript
const workerpool = require('workerpool');

async function test() {
  console.log('Runtime:', process.versions?.bun ? 'Bun' : 'Node.js');

  const pool = workerpool.pool({ workerType: 'thread' });

  try {
    const result = await pool.exec((a, b) => a + b, [2, 3]);
    console.log('Result:', result);
    console.log('✅ Basic test passed');
  } catch (err) {
    console.log('❌ Test failed:', err.message);
  }

  await pool.terminate();
}

test();
```

### Full Feature Test

```javascript
const workerpool = require('workerpool');

async function fullTest() {
  const pool = workerpool.pool({
    workerType: 'thread',
    maxWorkers: 4
  });

  // Test 1: Basic execution
  const sum = await pool.exec((a, b) => a + b, [10, 20]);
  console.assert(sum === 30, 'Basic execution failed');

  // Test 2: Parallel execution
  const results = await Promise.all([
    pool.exec(x => x * 2, [5]),
    pool.exec(x => x * 3, [5]),
    pool.exec(x => x * 4, [5])
  ]);
  console.assert(results.join(',') === '10,15,20', 'Parallel execution failed');

  // Test 3: Stats
  const stats = pool.stats();
  console.assert(stats.totalWorkers > 0, 'Stats failed');

  // Test 4: Methods
  const methods = await pool.exec('methods');
  console.assert(methods.includes('run'), 'Methods failed');

  await pool.terminate();
  console.log('✅ All tests passed');
}

fullTest().catch(console.error);
```

---

*Document Version: 1.0*
*Last Updated: December 2025*

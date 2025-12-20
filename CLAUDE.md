# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**workerpool** (`@danielsimonjr/workerpool`) is a thread pool implementation that runs on both Node.js and browsers. It offloads CPU-intensive tasks to worker processes/threads. This is a fork of [josdejong/workerpool](https://github.com/josdejong/workerpool) with additional TypeScript, WASM, and Bun runtime support.

**Version**: 10.0.1
**License**: Apache-2.0

## Build & Test Commands

```bash
npm install          # Install dependencies
npm run build        # Build JavaScript library (rollup + TypeScript types)
npm test             # Build, run all tests (JS, TS, types)
npm run test:js      # Run JavaScript tests only (mocha)
npm run test:ts      # Run TypeScript tests only (vitest)
npm run test:types   # Test TypeScript type definitions only
npm run coverage     # Generate test coverage report (output: ./coverage/index.html)
```

### Dual Build System

The library supports two separate builds:

**JavaScript Build** (Legacy):
```bash
npm run build:js     # Build JavaScript bundles (src/js/ → dist/)
```
Outputs: `dist/workerpool.js`, `dist/workerpool.min.js`, `dist/worker.js`, `dist/worker.min.js`

**TypeScript + WASM Build** (Modern):
```bash
npm run build:wasm   # Build TypeScript + WASM (src/ts/ → dist/ts/)
npm run build:ts     # Build TypeScript only (no WASM compilation)
```
Outputs: `dist/ts/index.js`, `dist/ts/full.js`, `dist/ts/minimal.js`, plus WASM files

### WASM Commands
```bash
npm run build:wasm:debug   # Build WASM with debug info
npm run build:wasm:esm     # Build WASM as ES module
npm run build:wasm:raw     # Build raw WASM without bindings
npm run build:wasm:all     # Build all WASM variants
npm run build:wasm:embed   # Build and embed WASM bytes in JS
npm run build:wasm:validate # Build and validate WASM output
npm run build:wasm:clean   # Clean and rebuild WASM
```

### Benchmarking
```bash
node benchmark.mjs   # Compare JS vs TS+WASM performance
```

### Running Individual Tests
```bash
# JavaScript tests (mocha)
npm run build && mocha test/js/Pool.test.js

# TypeScript tests (vitest)
npm run test:ts               # All TypeScript tests
npx vitest run test/ts/Pool.vitest.ts  # Single test file
```

## Architecture

### Entry Points

The library provides multiple entry points via `package.json` exports:

| Import Path | Description | Source |
|-------------|-------------|--------|
| `workerpool` | Legacy JS API (default) | `src/js/index.js` |
| `workerpool/modern` | TypeScript build | `dist/ts/index.js` |
| `workerpool/minimal` | Lightweight (~5KB), no WASM | `dist/ts/minimal.js` |
| `workerpool/full` | Complete (~34KB) with WASM, debug | `dist/ts/full.js` |
| `workerpool/wasm` | Direct WASM utilities only | `dist/ts/wasm/index.js` |
| `workerpool/errors` | Error classes only | `dist/ts/errors.js` |
| `workerpool/debug` | Debug/logging utilities only | `dist/ts/debug.js` |

### Source Code Structure

```
src/
├── js/                    # Legacy JavaScript implementation
│   ├── index.js           # Public API entry point
│   ├── Pool.js            # Worker pool management
│   ├── WorkerHandler.js   # Single worker control
│   ├── worker.js          # Worker-side code
│   ├── Promise.js         # Custom Promise with cancel/timeout
│   ├── queues.js          # Task queue implementations
│   ├── transfer.js        # Transferable object helpers
│   ├── environment.js     # Platform detection
│   ├── capabilities.js    # Runtime capability detection
│   ├── validateOptions.js # Options validation
│   ├── worker-url.js      # Worker URL resolution
│   ├── binary-serializer.js # Binary data serialization
│   ├── debug-port-allocator.js # Debug port management
│   ├── types.js           # Type definitions
│   ├── header.js          # Banner/header for builds
│   ├── requireFoolWebpack.js # Webpack workaround
│   └── generated/         # Auto-generated files
│       └── embeddedWorker.js
│
├── ts/                    # TypeScript implementation
│   ├── index.ts           # Main entry (workerpool/modern)
│   ├── minimal.ts         # Minimal entry (workerpool/minimal)
│   ├── full.ts            # Full entry (workerpool/full)
│   ├── errors.ts          # Error class definitions
│   ├── debug.ts           # Debug/logging utilities
│   │
│   ├── core/              # Core pool components
│   │   ├── Pool.ts            # Type-safe pool implementation
│   │   ├── WorkerHandler.ts   # Worker lifecycle management
│   │   ├── Promise.ts         # Typed Promise with cancellation
│   │   ├── TaskQueue.ts       # Queue interface & implementations
│   │   ├── validateOptions.ts # Options validation
│   │   ├── binary-serializer.ts   # Binary data serialization
│   │   ├── batch-serializer.ts    # Batch operation serialization
│   │   ├── batch-executor.ts      # Batch task execution
│   │   ├── metrics.ts         # Performance metrics collection
│   │   ├── circular-buffer.ts # O(1) circular buffer implementations
│   │   ├── debug-port-allocator.ts # Debug port management
│   │   ├── parallel-processing.ts # Parallel array operations (reduce, filter, etc.)
│   │   ├── main-thread-executor.ts # Graceful degradation fallback
│   │   └── session-manager.ts # Worker session management
│   │
│   ├── platform/          # Platform abstraction layer
│   │   ├── environment.ts     # Node.js vs browser vs Bun detection
│   │   ├── transfer.ts        # Typed transfer helpers
│   │   ├── transfer-detection.ts  # Transferable detection
│   │   ├── capabilities.ts    # Runtime capability detection
│   │   ├── worker-url.ts      # Worker URL resolution
│   │   ├── channel-factory.ts # Communication channel factory
│   │   ├── message-batcher.ts # Message batching utilities
│   │   ├── result-stream.ts   # Streaming results
│   │   ├── shared-memory.ts   # SharedArrayBuffer utilities
│   │   └── structured-clone.ts # Structured clone helpers
│   │
│   ├── workers/           # Worker management
│   │   ├── worker.ts          # Worker-side registration
│   │   ├── WorkerCache.ts     # Worker instance caching
│   │   ├── adaptive-scaler.ts # Dynamic worker scaling
│   │   ├── affinity.ts        # CPU affinity management
│   │   ├── health-monitor.ts  # Worker health tracking
│   │   └── recycler.ts        # Worker recycling logic
│   │
│   ├── wasm/              # WebAssembly layer
│   │   ├── index.ts           # WASM exports
│   │   ├── WasmBridge.ts      # JS-WASM interop
│   │   ├── WasmLoader.ts      # WASM loading utilities
│   │   ├── WasmTaskQueue.ts   # WASM-backed queue
│   │   ├── EmbeddedWasmLoader.ts  # Embedded WASM loading
│   │   ├── WasmWorkerTemplate.ts  # WASM worker utilities
│   │   ├── feature-detection.ts   # WASM capability detection
│   │   └── simd-processor.ts  # SIMD operations
│   │
│   ├── assembly/          # AssemblyScript source (compiled to WASM)
│   │   ├── index.ts           # WASM module entry
│   │   ├── priority-queue.ts  # Lock-free priority queue
│   │   ├── ring-buffer.ts     # Lock-free ring buffer
│   │   ├── task-slots.ts      # Task slot management
│   │   ├── atomics.ts         # Atomic operations
│   │   ├── memory.ts          # Memory management
│   │   ├── stats.ts           # Statistics tracking
│   │   ├── errors.ts          # WASM error handling
│   │   ├── histogram.ts       # Histogram implementation
│   │   ├── circular-buffer.ts # O(1) circular buffer
│   │   ├── simd-batch.ts      # SIMD batch operations
│   │   ├── tsconfig.json      # AssemblyScript config
│   │   └── stubs/             # Pure TS stubs for testing
│   │       ├── index.ts
│   │       ├── priority-queue.ts
│   │       ├── ring-buffer.ts
│   │       ├── task-slots.ts
│   │       ├── atomics.ts
│   │       ├── memory.ts
│   │       ├── stats.ts
│   │       ├── errors.ts
│   │       ├── histogram.ts
│   │       ├── circular-buffer.ts
│   │       └── simd-batch.ts
│   │
│   ├── types/             # TypeScript type definitions
│   │   ├── index.ts           # Core types export
│   │   ├── core.ts            # Shared types (ExecOptions, WorkerpoolPromise)
│   │   ├── internal.ts        # Internal types
│   │   ├── messages.ts        # Message protocol types
│   │   ├── worker-methods.ts  # Worker method types
│   │   ├── parallel.ts        # Parallel processing types (MapperFn, ReducerFn, etc.)
│   │   └── session.ts         # Session types (Session, SessionOptions, etc.)
│   │
│   └── generated/         # Auto-generated files
│       ├── embeddedWasm.ts    # Embedded WASM bytes
│       └── wasmTypes.ts       # Generated WASM types
```

### Test Structure

```
test/
├── js/                    # JavaScript tests (mocha)
│   ├── Pool.test.js           # Pool functionality tests
│   ├── WorkerHandler.test.js  # Worker handler tests
│   ├── Promise.test.js        # Promise tests
│   ├── Queues.test.js         # Queue tests
│   ├── environment.test.js    # Environment detection tests
│   ├── wasm.test.js           # WASM functionality tests
│   ├── debug-port-allocator-test.js # Debug port tests
│   ├── utils.js               # Test utilities
│   ├── queues/                # Queue-specific tests
│   │   └── queue-factory.test.js
│   ├── forkToKill/            # Fork/kill tests
│   │   └── common.js
│   ├── types/                 # TypeScript type tests
│   │   ├── workerpool-tests.ts
│   │   └── tsconfig.json
│   └── workers/               # Test worker scripts
│       ├── simple.js
│       ├── async.js
│       ├── cleanup.js
│       ├── cleanup-async.js
│       ├── cleanup-abort.js
│       ├── crash.js
│       ├── emit.js
│       ├── interval.js
│       ├── console.js
│       ├── transfer-to.js
│       ├── transfer-from.js
│       ├── transfer-emit.js
│       ├── testIsMainThread.js
│       └── worker-cache.test.js
│
└── ts/                    # TypeScript tests (vitest)
    ├── Pool.vitest.ts         # Pool tests
    ├── WorkerHandler.vitest.ts # Worker handler tests
    ├── Promise.vitest.ts      # Promise tests
    ├── TaskQueue.vitest.ts    # Queue tests
    ├── transfer.vitest.ts     # Transfer tests
    ├── environment.vitest.ts  # Environment tests
    ├── wasm.vitest.ts         # WASM tests
    ├── circular-buffer.vitest.ts # Circular buffer tests
    ├── parallel-processing.vitest.ts # Parallel array operations tests
    ├── main-thread-executor.vitest.ts # Graceful degradation tests
    ├── session-manager.vitest.ts # Session management tests
    └── assembly/              # AssemblyScript module tests
        ├── priority-queue.vitest.ts
        ├── ring-buffer.vitest.ts
        ├── task-slots.vitest.ts
        ├── memory.vitest.ts
        ├── errors.vitest.ts
        ├── histogram.vitest.ts
        ├── circular-buffer.vitest.ts
        ├── simd-batch.vitest.ts
        ├── atomics.vitest.ts
        └── stats.vitest.ts
```

### Worker Types

The `workerType` option controls which backend is used:
- `'auto'` (default) - Web Workers in browser, worker_threads in Node.js 11.7+, child_process as fallback
- `'web'` - Browser Web Workers only
- `'thread'` - Node.js worker_threads only
- `'process'` - Node.js child_process only

### Message Protocol

Workers communicate via JSON-RPC style messages with `id`, `method`, `params`, `result`, `error` fields. Special method IDs:
- `__workerpool-terminate__` - Signals worker to exit
- `__workerpool-cleanup__` - Triggers abort listeners before potential termination

### Key Patterns

1. **Dynamic function execution**: Functions can be stringified and sent to workers via `pool.exec(fn, args)`
2. **Dedicated workers**: Worker scripts register methods via `workerpool.worker({ methodName: fn })`
3. **Proxy pattern**: `pool.proxy()` returns an object with methods mirroring the worker's registered functions
4. **Transferable objects**: Use `workerpool.Transfer` to efficiently pass ArrayBuffers between threads
5. **WASM queues**: Use `workerpool/full` with `canUseWasmThreads()` for lock-free task scheduling
6. **Batch operations**: `pool.execBatch()` and `pool.map()` for parallel task execution
7. **Parallel array operations**: `pool.reduce()`, `pool.filter()`, `pool.find()`, etc. for chunked parallel processing
8. **Graceful degradation**: `MainThreadExecutor` provides fallback when workers aren't available
9. **Session support**: `pool.createSession()` for stateful worker interactions with worker affinity

## Runtime Support

### Node.js

All features fully supported in Node.js 11.7+ (worker_threads) or earlier versions via child_process fallback.

### Bun Compatibility

Workerpool is **fully compatible** with Bun 1.3.x (TypeScript build only):

| Feature | Status | Notes |
|---------|--------|-------|
| Worker Threads (`workerType: 'thread'`) | ✅ Full Support | **Recommended for Bun** |
| Auto Worker Type (`workerType: 'auto'`) | ✅ Full Support | Uses worker_threads |
| Child Process (`workerType: 'process'`) | ⚠️ Partial | IPC issues in some scenarios |
| TypeScript Build | ✅ Full Support | All 513 tests pass |
| WASM Support | ✅ Full Support | SharedArrayBuffer, Atomics work |

**Recommended Bun configuration:**
```javascript
const workerpool = require('workerpool');
const pool = workerpool.pool({ workerType: 'thread' }); // Always use 'thread' with Bun
```

**TypeScript API provides Bun helpers:**
```typescript
import { isBun, recommendedWorkerType, optimalPool, getRuntimeInfo } from 'workerpool/modern';

if (isBun) {
  const pool = optimalPool(); // Automatically uses best settings for Bun
}
```

See `docs/BUN_COMPATIBILITY.md` for detailed Bun integration guide.

### Browser Support

Works in modern browsers with Web Workers. For SharedArrayBuffer features, requires:
- HTTPS (secure context)
- COOP/COEP headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`

## Build Scripts

Located in `scripts/`:
- `build-js.mjs` - Main build script for JS and TS compilation
- `build-wasm.mjs` - AssemblyScript to WASM compilation
- `generate-wasm-bindings.mjs` - Generate WASM JS bindings
- `validate-wasm.mjs` - Validate WASM output

## Configuration Files

- `rollup.config.mjs` - Rollup bundler config for JS builds
- `tsconfig.json` - Main TypeScript config (noEmit for type checking)
- `tsconfig.build.json` - TypeScript build config (emits to dist/ts/)
- `tsconfig.rollup.json` - TypeScript config for rollup builds
- `asconfig.json` - AssemblyScript compiler config
- `vitest.config.ts` - Vitest test configuration (test/ts/)
- `.mocharc.js` - Mocha test configuration (test/js/)

## Documentation

The `docs/` directory contains additional documentation:

```
docs/
├── architecture/          # Architecture documentation
│   ├── ARCHITECTURE.md        # High-level architecture
│   ├── OVERVIEW.md            # System overview
│   ├── COMPONENTS.md          # Component details
│   ├── DATAFLOW.md            # Data flow diagrams
│   └── POOLIFIER_COMPARISON.md # Comparison with poolifier
│
├── planning/              # Development planning docs
│   ├── IMPROVEMENT_PLAN.md    # Improvement roadmap
│   ├── PHASE_1_SPRINT_*.json  # Phase 1 sprint tracking (1-8)
│   ├── PHASE_2_SPRINT_*.json  # Phase 2 sprint tracking (1-8)
│   ├── BATCH_API_DESIGN.md    # Batch API design
│   ├── LOCK_FREE_QUEUE_PROTOCOL.md
│   ├── SHARED_MEMORY_PROTOCOL.md
│   └── PHASE_1_REFACTORING_PLAN.md
│
├── BROWSER_SUPPORT.md     # Browser compatibility info
├── NODE_SUPPORT.md        # Node.js version support
├── BUN_COMPATIBILITY.md   # Bun runtime compatibility guide
├── BUN_INTEGRATION_PLAN.md # Bun integration roadmap
├── LIBRARY_INTEGRATION.md # Integration guide
├── CODEBASE_EVALUATION.md # Codebase analysis
├── WORKERPOOL_IMPROVEMENTS.md # Feature improvements
├── BREAKING_CHANGES.md    # Breaking changes log
├── MIGRATION_v10_to_v11.md # Migration guide
└── TS_WASM_OPTIMIZATION_ANALYSIS.md # Performance analysis
```

## Development Workflow

### Type Checking

```bash
npm run typecheck          # Check TypeScript types in src/ts/
npm run typecheck:wasm     # Check AssemblyScript types
```

### Watching for Changes

```bash
npm run watch              # Watch JS build (rollup)
npm run watch:wasm         # Watch WASM build
npm run build:js:watch     # Watch JS build
npm run build:ts:watch     # Watch TS build
```

### Build & Publish

```bash
# Correct workflow
1. npm run build              # Build library
2. npm test                   # Run all tests
3. git add -A && git commit   # Commit changes
4. npm publish                # Publish to npm
5. git tag v1.2.3 && git push --tags  # Tag release
```

### Commit Convention

Use conventional commits: `feat:`, `fix:`, `docs:`, `perf:`, `test:`, `chore:`

### Cleanup Before Committing

Remove temporary debug/test artifacts before committing:
- Temporary test scripts (`test-*.js`, `debug-*.js`)
- Runtime artifacts (`.error.txt`, etc.)
- Check `git status` before committing

## Examples

The `examples/` directory contains usage examples:

```
examples/
├── offloadFunctions.js    # Dynamic function offloading
├── dedicatedWorker.js     # Dedicated worker setup
├── proxy.js               # Using worker proxy
├── async.js               # Async operations
├── abort.js               # Task cancellation
├── cleanup.js             # Resource cleanup
├── consoleCapture.js      # Console output capture
├── priorityQueue.js       # Priority queue usage
├── transferableObjects.js # Transferable objects
├── dynamicOptions.js      # Dynamic pool options
├── workers/               # Example worker scripts
├── browser/               # Browser examples
├── embeddedWorker/        # Embedded worker example
├── esbuild/               # esbuild integration
├── vite/                  # Vite integration
└── webpack5/              # Webpack 5 integration
```

## Performance Benchmarks

The TS+WASM build provides significant performance improvements:

**Node.js Benchmarks:**
- Pool creation: 2.32x faster
- Concurrent tasks: 1.30x faster
- Queue throughput: 1.32x faster

**Bun Benchmarks:**
- Queue throughput: 1.57x faster
- Pool creation: 1.36x faster
- Concurrent tasks: 1.11x faster

Run benchmarks: `node benchmark.mjs`

## Common Issues

### WASM Build Failures
If WASM builds fail, ensure AssemblyScript is installed: `npm install assemblyscript`

### Worker Path Issues
Always use absolute paths for worker scripts: `__dirname + '/myWorker.js'`

### SharedArrayBuffer Not Available
SharedArrayBuffer requires secure context (HTTPS) and proper COOP/COEP headers in browsers.

### Type Definition Issues
If types are out of sync, run `npm run build:types` to regenerate.

### Bun child_process Issues
If using Bun and experiencing IPC timeouts, always use `workerType: 'thread'` instead of `workerType: 'process'`.

## Key APIs

### Pool Creation
```javascript
// Basic pool (auto worker type)
const pool = workerpool.pool();

// Dedicated worker
const pool = workerpool.pool(__dirname + '/worker.js');

// With options
const pool = workerpool.pool({
  minWorkers: 2,
  maxWorkers: 4,
  workerType: 'thread'
});
```

### Task Execution
```javascript
// Execute function
const result = await pool.exec((a, b) => a + b, [2, 3]);

// Execute worker method
const result = await pool.exec('methodName', [args]);

// Batch execution
const results = await pool.execBatch([
  ['method1', [arg1]],
  ['method2', [arg2]]
]);

// Parallel map
const results = await pool.map([1, 2, 3], (x) => x * 2);

// Parallel reduce
const sum = await pool.reduce(
  [1, 2, 3, 4, 5],
  (acc, x) => acc + x,
  (left, right) => left + right,
  { initialValue: 0 }
);

// Parallel filter
const evens = await pool.filter([1, 2, 3, 4, 5], (x) => x % 2 === 0);

// Parallel find
const found = await pool.find([1, 2, 3, 4, 5], (x) => x > 3);

// Parallel some/every
const hasEven = await pool.some([1, 2, 3], (x) => x % 2 === 0);
const allPositive = await pool.every([1, 2, 3], (x) => x > 0);

// Parallel count
const evenCount = await pool.count([1, 2, 3, 4, 5], (x) => x % 2 === 0);

// Parallel partition
const [evens, odds] = await pool.partition([1, 2, 3, 4, 5], (x) => x % 2 === 0);
// evens = [2, 4], odds = [1, 3, 5]

// Parallel groupBy
const groups = await pool.groupBy(items, (item) => item.type);
// { typeA: [...], typeB: [...] }

// Parallel flatMap
const flattened = await pool.flatMap([1, 2, 3], (x) => [x, x * 2]);
// [1, 2, 2, 4, 3, 6]

// Parallel unique
const unique = await pool.unique([1, 2, 2, 3, 3, 3]);
// [1, 2, 3]

// Parallel includes/indexOf
const hasThree = await pool.includes([1, 2, 3, 4, 5], 3); // true
const index = await pool.indexOf([1, 2, 3, 4, 5], 3); // 2

// Parallel reduceRight
const result = await pool.reduceRight(
  ['a', 'b', 'c'],
  (acc, x) => acc + x,
  (left, right) => left + right,
  { initialValue: '' }
); // 'cba'
```

### Worker Registration
```javascript
// worker.js
const workerpool = require('workerpool');

workerpool.worker({
  myMethod: function(arg) {
    return arg * 2;
  }
});
```

### Cleanup
```javascript
// Graceful termination
await pool.terminate();

// Force termination
await pool.terminate(true);

// With timeout
await pool.terminate(false, 5000);
```

### Session Support
```javascript
// Create a session (worker affinity)
const session = await pool.createSession({
  initialState: { count: 0 },
  timeout: 60000,  // Auto-close after 60s idle
  maxTasks: 100    // Max tasks before forced close
});

// Execute tasks on the same worker
await session.exec('increment', [5]);
await session.exec('increment', [10]);

// Access session state
const state = await session.getState();
await session.setState({ count: 100 });

// Close when done
await session.close();

// Close all sessions
await pool.closeSessions();
```

### Graceful Degradation
```javascript
import {
  MainThreadExecutor,
  hasWorkerSupport,
  createPoolWithFallback
} from 'workerpool/modern';

// Check worker support
if (!hasWorkerSupport()) {
  console.log('Workers not available, using main thread');
}

// Auto-fallback to main thread if workers unavailable
const pool = createPoolWithFallback(__dirname + '/worker.js');

// Or create executor directly
const executor = new MainThreadExecutor({
  methods: {
    add: (a, b) => a + b,
    multiply: (a, b) => a * b
  }
});

// Same API as Pool
const result = await executor.exec('add', [2, 3]);
```

### TypeScript API Exports

The TypeScript builds (`workerpool/minimal`, `workerpool/modern`, `workerpool/full`) export comprehensive APIs for developer integration:

#### Platform Detection (all builds)
```typescript
import {
  platform,              // 'node' | 'browser'
  isMainThread,          // boolean
  cpus,                  // number
  isNode,                // (process: unknown) => boolean
  getPlatformInfo,       // () => PlatformInfo
  hasWorkerThreads,      // boolean
  hasSharedArrayBuffer,  // boolean
  hasAtomics,            // boolean
} from 'workerpool/minimal';
```

#### Bun Compatibility (all builds)
```typescript
import {
  isBun,                    // boolean
  bunVersion,               // string | null
  recommendedWorkerType,    // 'auto' | 'thread' | 'process' | 'web'
  getWorkerTypeSupport,     // () => WorkerTypeSupport
  isWorkerTypeSupported,    // (type: string) => boolean
} from 'workerpool/minimal';
```

#### Data Structures (all builds)
```typescript
import {
  CircularBuffer,         // Fixed-size O(1) circular buffer
  GrowableCircularBuffer, // Growable circular buffer
  TimeWindowBuffer,       // Time-based buffer with pruning
  FIFOQueue,              // First-in-first-out queue
  LIFOQueue,              // Last-in-first-out queue
} from 'workerpool/minimal';
```

#### Transfer Detection (modern/full builds)
```typescript
import {
  isTransferable,         // (value: unknown) => boolean
  detectTransferables,    // (value: unknown) => DetectionResult
  getTransferableType,    // (value: unknown) => TransferableType | null
  validateTransferables,  // (list: Transferable[]) => ValidationResult
} from 'workerpool/modern';
```

#### Metrics (modern/full builds)
```typescript
import { MetricsCollector } from 'workerpool/modern';
```

#### Runtime Utilities (modern/full builds)
```typescript
import {
  optimalPool,    // Create pool with optimal settings for current runtime
  getRuntimeInfo, // Get complete runtime diagnostics
} from 'workerpool/modern';
```

#### Parallel Processing (modern/full builds)
```typescript
import {
  // Parallel array operations available on Pool/MainThreadExecutor:
  // pool.reduce(), pool.filter(), pool.find(), pool.findIndex(),
  // pool.some(), pool.every(), pool.forEach(), pool.count(),
  // pool.partition(), pool.groupBy(), pool.flatMap(), pool.unique(),
  // pool.includes(), pool.indexOf(), pool.reduceRight()

  // Factory functions for creating parallel operations
  createParallelReduce,
  createParallelForEach,
  createParallelFilter,
  createParallelSome,
  createParallelEvery,
  createParallelFind,
  createParallelFindIndex,
  createParallelCount,
  createParallelPartition,
  createParallelIncludes,
  createParallelIndexOf,
  createParallelGroupBy,
  createParallelFlatMap,
  createParallelUnique,
  createParallelReduceRight,

  // Types
  ParallelOptions,
  ReduceOptions,
  FindOptions,
  PredicateOptions,
  UniqueOptions,
  GroupByOptions,
  FlatMapOptions,
  ForEachResult,
  CountResult,
  PartitionResult,
  GroupByResult,
  UniqueResult,
  MapperFn,
  ReducerFn,
  CombinerFn,
  PredicateFn,
  ConsumerFn,
  KeySelectorFn,
  FlatMapFn,
  EqualityFn,
} from 'workerpool/modern';
```

#### Graceful Degradation (all builds)
```typescript
import {
  MainThreadExecutor,       // Pool-like API for main thread execution
  hasWorkerSupport,         // Check if workers are available
  createPoolWithFallback,   // Auto-fallback to main thread
  mainThreadExecutor,       // Factory function
} from 'workerpool/minimal';
```

#### Session Support (modern/full builds)
```typescript
import {
  SessionManager,           // Manages worker sessions
  // Types
  Session,
  SessionOptions,
  SessionStats,
  SessionState,
} from 'workerpool/modern';
```

#### Full Build Extras
```typescript
import {
  // WASM support
  canUseWasm, WasmBridge, hasWasmSupport, hasFullWasmSupport,
  // Debug utilities
  LogLevel, enableDebug, disableDebug,
  // Worker management
  AdaptiveScaler, HealthMonitor, WorkerCache,
  // Session support
  SessionManager,
} from 'workerpool/full';
```

#### Advanced Pool (modern/full builds)
```typescript
import {
  // AdvancedPool - Pool with intelligent scheduling
  AdvancedPool,
  advancedPool,           // Factory with optimal defaults
  cpuIntensivePool,       // Optimized for CPU-bound tasks
  ioIntensivePool,        // Optimized for I/O-bound tasks
  mixedWorkloadPool,      // Optimized for mixed workloads

  // Worker choice strategies
  RoundRobinStrategy,
  LeastBusyStrategy,
  LeastUsedStrategy,
  FairShareStrategy,
  WeightedRoundRobinStrategy,
  InterleavedWeightedRoundRobinStrategy,
  WorkerChoiceStrategyManager,
  createStrategy,

  // Work stealing
  WorkStealingDeque,
  WorkStealingScheduler,
  rebalanceTasks,

  // Task affinity
  TaskAffinityRouter,
  createAffinityKey,
  objectAffinityKey,

  // Types
  AdvancedPoolOptions,
  AdvancedExecOptions,
  AdvancedPoolStats,
  WorkerChoiceStrategy,
  WorkerSelectionOptions,
  WorkerStats,
  StealingPolicy,
  WorkStealingStats,
  AffinityKey,
  RoutingDecision,
  AffinityRouterOptions,
} from 'workerpool/modern';

// Usage example
const pool = advancedPool('./worker.js', {
  workerChoiceStrategy: 'least-busy',
  enableWorkStealing: true,
  stealingPolicy: 'busiest-first',
  enableTaskAffinity: true,
});

// Execute with affinity (tasks with same key go to same worker)
await pool.execWithAffinity('user-123', 'processData', [data]);

// Execute with task type hint (routes to best performer)
await pool.execWithType('image-processing', 'resize', [image]);

// Change strategy at runtime
pool.setWorkerChoiceStrategy('fair-share');

// Get advanced statistics
const stats = pool.stats();
console.log(stats.workStealingStats?.totalSteals);
```

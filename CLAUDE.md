# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**workerpool** is a thread pool implementation that runs on both Node.js and browsers. It offloads CPU-intensive tasks to worker processes/threads.

### Entry Points

The library provides multiple entry points via `package.json` exports:

| Import Path | Description | Source |
|-------------|-------------|--------|
| `workerpool` | Legacy JS API (default) | `src/js/index.js` |
| `workerpool/modern` | TypeScript build | `dist/ts/index.js` |
| `workerpool/minimal` | Lightweight (~5KB), no WASM | `dist/ts/minimal.js` |
| `workerpool/full` | Complete (~15KB) with WASM, debug | `dist/ts/full.js` |
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
│   └── generated/         # Auto-generated files (embeddedWorker.js)
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
│   │   ├── QueueFactory.ts    # Pluggable queue strategies
│   │   ├── validateOptions.ts # Options validation
│   │   ├── binary-serializer.ts   # Binary data serialization
│   │   ├── batch-serializer.ts    # Batch operation serialization
│   │   ├── batch-executor.ts      # Batch task execution
│   │   ├── metrics.ts         # Performance metrics collection
│   │   └── debug-port-allocator.ts # Debug port management
│   │
│   ├── platform/          # Platform abstraction layer
│   │   ├── environment.ts     # Node.js vs browser detection
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
│   │   ├── simd-batch.ts      # SIMD batch operations
│   │   ├── tsconfig.json      # AssemblyScript config
│   │   └── stubs/             # Pure TS stubs for testing
│   │
│   ├── types/             # TypeScript type definitions
│   │   ├── index.ts           # Core types export
│   │   ├── internal.ts        # Internal types
│   │   ├── messages.ts        # Message protocol types
│   │   └── worker-methods.ts  # Worker method types
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
│   ├── types/                 # TypeScript type tests
│   │   └── workerpool-tests.ts
│   └── workers/               # Test worker scripts
│
└── ts/                    # TypeScript tests (vitest)
    ├── Pool.vitest.ts         # Pool tests
    ├── WorkerHandler.vitest.ts # Worker handler tests
    ├── Promise.vitest.ts      # Promise tests
    ├── TaskQueue.vitest.ts    # Queue tests
    ├── transfer.vitest.ts     # Transfer tests
    ├── environment.vitest.ts  # Environment tests
    ├── wasm.vitest.ts         # WASM tests
    └── assembly/              # AssemblyScript module tests
        ├── priority-queue.vitest.ts
        ├── ring-buffer.vitest.ts
        ├── task-slots.vitest.ts
        ├── memory.vitest.ts
        └── errors.vitest.ts
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

### Build Scripts

Located in `scripts/`:
- `build-js.mjs` - Main build script for JS and TS compilation
- `build-wasm.mjs` - AssemblyScript to WASM compilation
- `generate-wasm-bindings.mjs` - Generate WASM JS bindings
- `validate-wasm.mjs` - Validate WASM output

### Configuration Files

- `rollup.config.mjs` - Rollup bundler config for JS builds
- `tsconfig.json` - Main TypeScript config (noEmit for type checking)
- `tsconfig.build.json` - TypeScript build config (emits to dist/ts/)
- `tsconfig.rollup.json` - TypeScript config for rollup builds
- `asconfig.json` - AssemblyScript compiler config
- `vitest.config.ts` - Vitest test configuration

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
│   ├── PHASE_1_*.json         # Phase 1 sprint tracking
│   ├── PHASE_2_*.json         # Phase 2 sprint tracking
│   ├── BATCH_API_DESIGN.md    # Batch API design
│   ├── LOCK_FREE_QUEUE_PROTOCOL.md
│   ├── SHARED_MEMORY_PROTOCOL.md
│   └── PHASE_1_REFACTORING_PLAN.md
│
├── BROWSER_SUPPORT.md     # Browser compatibility info
├── NODE_SUPPORT.md        # Node.js version support
├── LIBRARY_INTEGRATION.md # Integration guide
├── CODEBASE_EVALUATION.md # Codebase analysis
├── WORKERPOOL_IMPROVEMENTS.md # Feature improvements
├── BREAKING_CHANGES.md    # Breaking changes log
└── MIGRATION_v10_to_v11.md # Migration guide
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

## Common Issues

### WASM Build Failures
If WASM builds fail, ensure AssemblyScript is installed: `npm install assemblyscript`

### Worker Path Issues
Always use absolute paths for worker scripts: `__dirname + '/myWorker.js'`

### SharedArrayBuffer Not Available
SharedArrayBuffer requires secure context (HTTPS) and proper COOP/COEP headers in browsers.

### Type Definition Issues
If types are out of sync, run `npm run build:types` to regenerate.

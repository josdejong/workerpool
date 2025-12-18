# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm install          # Install dependencies
npm run build        # Build library (rollup + TypeScript types)
npm test             # Build, run mocha tests, and test types
npm run test:types   # Test TypeScript type definitions only
npm run coverage     # Generate test coverage report (output: ./coverage/index.html)
```

### Dual Build System

The library supports two separate builds:

**JavaScript Build** (Legacy):
```bash
npm run build:js     # Build JavaScript bundles (src/js/ → dist/)
```

**TypeScript + WASM Build** (Modern):
```bash
npm run build:wasm   # Build TypeScript + WASM (src/ts/ → dist/ts/)
```

This compiles AssemblyScript to WASM, generates embedded bindings, and compiles TypeScript.

### Additional WASM Commands
```bash
npm run build:wasm:debug  # Build WASM with debug info
npm run build:wasm:embed  # Build WASM and generate embedded bindings only
npm run build:wasm:all    # Build all WASM variants
```

### Benchmarking
```bash
node benchmark.mjs   # Compare JS vs TS+WASM performance
```

To run a single test file:
```bash
npm run build && mocha test/Pool.test.js
```

## Architecture

**workerpool** is a thread pool implementation that runs on both Node.js and browsers. It offloads CPU-intensive tasks to worker processes/threads.

### Entry Points

The library provides multiple entry points for different use cases:

- **`workerpool`** (default) - Legacy JS API via `src/js/index.js`
- **`workerpool/modern`** - TypeScript build via `dist/ts/index.js`
- **`workerpool/minimal`** - Lightweight TypeScript build (~5KB) without WASM
- **`workerpool/full`** - Complete TypeScript build (~25KB) with WASM support, debug utilities
- **`workerpool/wasm`** - Direct WASM utilities only
- **`workerpool/errors`** - Error classes only
- **`workerpool/debug`** - Debug/logging utilities only

### Core Components (Legacy JS in `src/js/`)

- **`src/js/index.js`** - Public API entry point. Exports `pool()`, `worker()`, `workerEmit()`, `Transfer`, and utility constants.
- **`src/js/Pool.js`** - Manages worker lifecycle and task queue. Creates `WorkerHandler` instances on demand up to `maxWorkers`. Tasks are queued (FIFO/LIFO/custom) and dispatched to available workers.
- **`src/js/WorkerHandler.js`** - Controls a single worker (child process, worker thread, or web worker). Handles message passing, task execution, timeouts, cancellation, and graceful termination with cleanup.
- **`src/js/worker.js`** - Runs inside the worker process/thread. Receives RPC messages, executes registered methods, handles abort listeners for cleanup before termination.
- **`src/js/Promise.js`** - Custom Promise implementation with `cancel()`, `timeout()`, and `always()` methods.

### TypeScript Core (`src/ts/core/`)

TypeScript rewrites with enhanced type safety:
- **`Pool.ts`** - Type-safe pool implementation
- **`WorkerHandler.ts`** - Worker lifecycle with full typing
- **`Promise.ts`** - Typed Promise with cancellation
- **`TaskQueue.ts`** / **`QueueFactory.ts`** - Pluggable queue strategies

### WASM Layer (`src/ts/wasm/` + `src/ts/assembly/`)

Optional WebAssembly acceleration for lock-free task queues:
- **`src/ts/assembly/*.ts`** - AssemblyScript source compiled to WASM (priority queue, ring buffer, atomics)
- **`src/ts/assembly/stubs/`** - Pure TypeScript stubs for testing without WASM
- **`src/ts/wasm/WasmBridge.ts`** - JavaScript-WASM interop layer
- **`src/ts/wasm/WasmTaskQueue.ts`** - WASM-backed queue implementation
- **`src/ts/wasm/EmbeddedWasmLoader.ts`** - Load pre-embedded WASM bytes
- **`src/ts/wasm/feature-detection.ts`** - Runtime checks for WebAssembly, SharedArrayBuffer, Atomics

### Platform Abstraction (`src/ts/platform/`)

- **`environment.ts`** - Detects Node.js vs browser, main thread vs worker
- **`transfer.ts`** - Typed helpers for transferable objects (ArrayBuffer, TypedArrays, ImageData)

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

### Type Definitions

TypeScript types are generated from source via `npm run build:types`. Output goes to `types/` directory with `.d.ts` and `.d.ts.map` files.

## Development Workflow

### Build & Publish

```bash
# Correct workflow
1. npm run build              # Build library
2. npm test                   # Run all tests
3. git add -A && git commit   # Commit changes
4. npm publish                # Publish to npm
5. git tag v1.2.3 && git push --tags  # Tag release
```

See HISTORY.md for version changelog format.

### Commit Convention

Use conventional commits: `feat:`, `fix:`, `docs:`, `perf:`, `test:`, `chore:`

### Cleanup Before Committing

Remove temporary debug/test artifacts before committing:
- Temporary test scripts (`test-*.js`, `debug-*.js`)
- Runtime artifacts (`.error.txt`, etc.)
- Check `git status` before committing

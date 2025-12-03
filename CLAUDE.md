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

To run a single test file:
```bash
npm run build && mocha test/Pool.test.js
```

## Architecture

**workerpool** is a thread pool implementation that runs on both Node.js and browsers. It offloads CPU-intensive tasks to worker processes/threads.

### Core Components

- **`src/index.js`** - Public API entry point. Exports `pool()`, `worker()`, `workerEmit()`, `Transfer`, and utility constants.

- **`src/Pool.js`** - Manages worker lifecycle and task queue. Creates `WorkerHandler` instances on demand up to `maxWorkers`. Tasks are queued (FIFO/LIFO/custom) and dispatched to available workers.

- **`src/WorkerHandler.js`** - Controls a single worker (child process, worker thread, or web worker). Handles message passing, task execution, timeouts, cancellation, and graceful termination with cleanup.

- **`src/worker.js`** - Runs inside the worker process/thread. Receives RPC messages, executes registered methods, handles abort listeners for cleanup before termination.

- **`src/Promise.js`** - Custom Promise implementation with `cancel()`, `timeout()`, and `always()` methods.

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

### Type Definitions

TypeScript types are in `types/index.d.ts`, generated from JSDoc comments via `tsc -p .`

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
